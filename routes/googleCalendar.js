const express = require("express");
const router = express.Router();
const axios = require("axios");
const User = require("../models/User");
const { google } = require("googleapis");
const auth = require("../middleware/auth");

// Initialize Google OAuth2 client with dynamic redirect URI
const getRedirectUri = () => {
	// Check if we're in production (you can also check NODE_ENV or a custom env var)
	if (
		process.env.NODE_ENV === "production" ||
		process.env.GOOGLE_CALENDAR_REDIRECT_URI_PROD
	) {
		return (
			process.env.GOOGLE_CALENDAR_REDIRECT_URI_PROD ||
			process.env.GOOGLE_CALENDAR_REDIRECT_URI
		);
	}
	return (
		process.env.GOOGLE_CALENDAR_REDIRECT_URI_LOCAL ||
		process.env.GOOGLE_CALENDAR_REDIRECT_URI
	);
};

// Helper function to get frontend redirect URL
const getFrontendRedirectUrl = (path = "/bookings") => {
	const params = "googleCalendar=connected";

	// Check if we're in production
	if (process.env.NODE_ENV === "production" || process.env.FRONTEND_URL_PROD) {
		const baseUrl = process.env.FRONTEND_URL_PROD || process.env.FRONTEND_URL;
		return `${baseUrl}${path}?${params}`;
	}

	// Use local development URL
	const localUrl = process.env.FRONTEND_URL_LOCAL || "http://localhost:5173";
	return `${localUrl}${path}?${params}`;
};

const oauth2Client = new google.auth.OAuth2(
	process.env.GOOGLE_CALENDAR_CLIENT_ID,
	process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
	getRedirectUri(),
);

// Helper function to refresh access token if expired
async function refreshAccessTokenIfNeeded(user) {
	const now = new Date();
	if (user.googleCalendarTokenExpiry && user.googleCalendarTokenExpiry <= now) {
		console.log("🔄 Refreshing Google Calendar access token...");
		try {
			oauth2Client.setCredentials({
				refresh_token: user.googleCalendarRefreshToken,
			});
			const { credentials } = await oauth2Client.refreshAccessToken();
			user.googleCalendarAccessToken = credentials.access_token;
			user.googleCalendarTokenExpiry = new Date(credentials.expiry_date);
			await user.save();
			console.log("✅ Access token refreshed successfully");
		} catch (error) {
			console.error("❌ Failed to refresh access token:", error);
			// Mark integration as not_connected if refresh fails
			user.googleCalendarIntegrationStatus = "not_connected";
			user.googleCalendarAccessToken = null;
			user.googleCalendarRefreshToken = null;
			user.googleCalendarTokenExpiry = null;
			await user.save();
			console.log(
				"✅ User calendar integration status updated to not_connected",
			);
			throw new Error(
				"Google Calendar authentication expired. Please reconnect.",
			);
		}
	}
	return user.googleCalendarAccessToken;
}

// Route to initiate Google Calendar OAuth flow
router.get("/auth/google", auth, (req, res) => {
	const scopes = [
		"https://www.googleapis.com/auth/calendar",
		"https://www.googleapis.com/auth/userinfo.email",
	];

	const url = oauth2Client.generateAuthUrl({
		access_type: "offline",
		scope: scopes,
		prompt: "consent",
		state: req.user.userId, // Pass the user ID in the state parameter
	});

	res.redirect(url);
});

// Route to initiate Google Calendar OAuth flow for staff members (PUBLIC - no auth required)
router.get("/auth/staff/:linkToken", async (req, res) => {
	try {
		const { linkToken } = req.params;
		const StaffMember = require("../models/StaffMember");

		// Find staff member by link token
		const staffMember = await StaffMember.findOne({
			calendarLinkToken: linkToken,
		});

		if (!staffMember) {
			return res.status(404).send("Invalid or expired calendar link");
		}

		// Check if link has expired
		if (!staffMember.isCalendarLinkValid()) {
			return res
				.status(410)
				.send(
					"Calendar link has expired. Please request a new link from your manager.",
				);
		}

		const scopes = [
			"https://www.googleapis.com/auth/calendar",
			"https://www.googleapis.com/auth/userinfo.email",
		];

		// Use a different state format to distinguish staff OAuth from user OAuth
		const state = JSON.stringify({
			type: "staff",
			staffId: staffMember._id.toString(),
		});

		const url = oauth2Client.generateAuthUrl({
			access_type: "offline",
			scope: scopes,
			prompt: "consent",
			state: state,
		});

		console.log(
			`🔄 Staff OAuth initiated for ${staffMember.name} (${staffMember.email})`,
		);
		res.redirect(url);
	} catch (error) {
		console.error("❌ Staff OAuth Initiation Error:", error);
		res.status(500).send("Failed to initiate Google Calendar connection");
	}
});

// Unified callback route to handle both staff and user Google OAuth
router.get("/auth/google/callback", async (req, res) => {
	const { code, state } = req.query;

	try {
		console.log("🔄 Google OAuth Callback: Exchanging code for tokens...");

		// Exchange authorization code for tokens
		const { tokens } = await oauth2Client.getToken(code);
		oauth2Client.setCredentials(tokens);

		console.log("✅ Google OAuth Callback: Tokens exchanged successfully");

		// Try to parse state as JSON (staff OAuth) or use as string (user OAuth)
		let stateData;
		try {
			stateData = JSON.parse(state);
		} catch {
			// Not JSON, treat as user ID (user OAuth)
			stateData = { type: "user", userId: state };
		}

		// Handle Staff OAuth
		if (stateData.type === "staff" && stateData.staffId) {
			console.log("🔄 Staff OAuth: Processing staff authentication...");

			const StaffMember = require("../models/StaffMember");
			const staffMember = await StaffMember.findById(stateData.staffId);

			if (!staffMember) {
				console.log("❌ Staff OAuth: Staff member not found");
				return res.status(404).send("Staff member not found");
			}

			console.log(
				"✅ Staff OAuth: Staff member found:",
				staffMember.email,
			);

			// Fetch user info to get email
			try {
				const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
				const userInfo = await oauth2.userinfo.get();
				staffMember.googleCalendarEmail = userInfo.data.email;
				console.log("✅ Google Calendar email fetched:", userInfo.data.email);
			} catch (emailError) {
				console.error("⚠️ Failed to fetch Google email:", emailError);
			}

			// Save tokens to staff member
			staffMember.googleCalendarAccessToken = tokens.access_token;
			staffMember.googleCalendarRefreshToken = tokens.refresh_token;
			staffMember.googleCalendarTokenExpiry = new Date(tokens.expiry_date);
			staffMember.googleCalendarIntegrationStatus = "connected";

			// Invalidate the calendar link token (one-time use)
			staffMember.invalidateCalendarLink();

			await staffMember.save();

			console.log(
				`✅ Staff OAuth: Tokens saved for ${staffMember.name}`,
			);

			// Redirect to a success page
			return res.send(`
				<!DOCTYPE html>
				<html>
				<head>
					<title>Calendar Connected</title>
					<style>
						body {
							font-family: system-ui, -apple-system, sans-serif;
							display: flex;
							justify-content: center;
							align-items: center;
							height: 100vh;
							margin: 0;
							background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
						}
						.container {
							background: white;
							padding: 3rem;
							border-radius: 12px;
							box-shadow: 0 4px 6px rgba(0,0,0,0.1);
							text-align: center;
							max-width: 500px;
						}
						.success-icon {
							width: 80px;
							height: 80px;
							margin: 0 auto 1.5rem;
							background: #10b981;
							border-radius: 50%;
							display: flex;
							align-items: center;
							justify-content: center;
							font-size: 3rem;
						}
						h1 {
							color: #1f2937;
							margin: 0 0 1rem 0;
							font-size: 1.875rem;
						}
						p {
							color: #6b7280;
							margin: 0 0 1.5rem 0;
							font-size: 1.125rem;
						}
						.email {
							background: #f3f4f6;
							padding: 0.5rem 1rem;
							border-radius: 6px;
							font-family: monospace;
							color: #374151;
						}
					</style>
				</head>
				<body>
					<div class="container">
						<div class="success-icon">✓</div>
						<h1>Calendar Connected Successfully!</h1>
						<p>Your Google Calendar has been connected.</p>
						<p class="email">${staffMember.googleCalendarEmail}</p>
						<p style="margin-top: 2rem; font-size: 0.875rem;">You can close this tab now.</p>
					</div>
				</body>
				</html>
			`);
		}

		// Handle User OAuth
		if (stateData.type === "user" || stateData.userId) {
			const userId = stateData.userId || stateData;
			console.log("🔄 User OAuth: Processing user authentication...");

			if (!userId) {
				console.log("❌ User OAuth: User ID not found in state");
				return res.status(400).send("User ID not found in state");
			}

			// Find the user by ID and save the tokens
			const user = await User.findById(userId);

			if (!user) {
				console.log("❌ User OAuth: User not found");
				return res.status(404).send("User not found");
			}

			console.log("✅ User OAuth: User found:", user.email);

			// Fetch user info to get email
			try {
				const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
				const userInfo = await oauth2.userinfo.get();
				user.googleCalendarEmail = userInfo.data.email;
				console.log("✅ Google Calendar email fetched:", userInfo.data.email);
			} catch (emailError) {
				console.error("⚠️ Failed to fetch Google email:", emailError);
				// Continue even if email fetch fails
			}

			user.googleCalendarAccessToken = tokens.access_token;
			user.googleCalendarRefreshToken = tokens.refresh_token;
			user.googleCalendarTokenExpiry = new Date(tokens.expiry_date);
			user.googleCalendarIntegrationStatus = "connected";

			await user.save();

			console.log("✅ User OAuth: Tokens saved to user record");

			// Redirect the user to the bookings page
			console.log("🔄 User OAuth: Redirecting to bookings page...");
			return res.redirect(getFrontendRedirectUrl("/bookings"));
		}

		// If we get here, state format is unexpected
		console.log("❌ OAuth Callback: Invalid state data");
		return res.status(400).send("Invalid OAuth state");
	} catch (error) {
		console.error("❌ Google OAuth Callback Error:", error);
		res.status(500).send("Failed to authenticate with Google Calendar");
	}
});

// Route to check Google Calendar integration status
router.get("/status", auth, async (req, res) => {
	try {
		const userId = req.user.userId; // Extract userId from the authenticated user
		if (!userId) {
			console.log("❌ Google Calendar Status: User not authenticated");
			return res.status(401).send("User not authenticated");
		}

		const user = await User.findById(userId);
		if (!user) {
			console.log("❌ Google Calendar Status: User not found");
			return res.status(404).send("User not found");
		}

		console.log(
			"✅ Google Calendar Status: Integration status retrieved successfully",
		);

		res.json({
			status: user.googleCalendarIntegrationStatus,
			isConnected: user.googleCalendarIntegrationStatus === "connected",
		});
	} catch (error) {
		console.error("❌ Google Calendar Status Error:", error);
		res.status(500).send("Failed to fetch Google Calendar status");
	}
});

// Route to fetch calendar events
router.get("/events", auth, async (req, res) => {
	try {
		const userId = req.user.userId;
		const user = await User.findById(userId);
		if (!user || user.googleCalendarIntegrationStatus !== "connected") {
			return res.status(400).json({ message: "Google Calendar not connected" });
		}

		// Refresh token if needed
		const accessToken = await refreshAccessTokenIfNeeded(user);

		// Set credentials
		oauth2Client.setCredentials({ access_token: accessToken });

		// Get calendar API
		const calendar = google.calendar({ version: "v3", auth: oauth2Client });

		// Get query params
		const timeMin = req.query.timeMin || new Date().toISOString();
		const timeMax = req.query.timeMax;
		const maxResults = parseInt(req.query.maxResults) || 250;

		// Fetch events
		const response = await calendar.events.list({
			calendarId: "primary",
			timeMin,
			timeMax,
			maxResults,
			singleEvents: true,
			orderBy: "startTime",
		});

		// Structure the events
		const events = response.data.items.map((event) => ({
			id: event.id,
			summary: event.summary,
			description: event.description,
			start: event.start,
			end: event.end,
			status: event.status,
			location: event.location,
			attendees: event.attendees,
			created: event.created,
			updated: event.updated,
		}));

		res.json({ events });
	} catch (error) {
		console.error("❌ Fetch Events Error:", error);
		res.status(500).json({ message: "Failed to fetch calendar events" });
	}
});

// Route to fetch bookings only
router.get("/bookings", auth, async (req, res) => {
	const userId = req.user.userId; // Declare userId outside try block
	try {
		const user = await User.findById(userId);
		if (!user || user.googleCalendarIntegrationStatus !== "connected") {
			return res.status(400).json({ message: "Google Calendar not connected" });
		}

		// Refresh token if needed
		const accessToken = await refreshAccessTokenIfNeeded(user);

		// Set credentials
		oauth2Client.setCredentials({ access_token: accessToken });

		// Get calendar API
		const calendar = google.calendar({ version: "v3", auth: oauth2Client });

		// Get query params
		const timeMin = req.query.timeMin || new Date().toISOString();
		const timeMax = req.query.timeMax;
		const maxResults = parseInt(req.query.maxResults) || 250;

		// Fetch events
		const response = await calendar.events.list({
			calendarId: "primary",
			timeMin,
			timeMax,
			maxResults,
			singleEvents: true,
			orderBy: "startTime",
		});

		// Filter bookings: events where summary or description contains 'booking' (case insensitive)
		const bookings = response.data.items
			.filter((event) => {
				const summary = (event.summary || "").toLowerCase();
				const description = (event.description || "").toLowerCase();
				return summary.includes("booking") || description.includes("booking");
			})
			.map((event) => ({
				id: event.id,
				summary: event.summary,
				description: event.description,
				start: event.start,
				end: event.end,
				status: event.status,
				location: event.location,
				attendees: event.attendees,
				created: event.created,
				updated: event.updated,
			}));

		console.log(
			`📅 Bookings fetched for user ${userId}: ${bookings.length} bookings`,
		);
		if (bookings.length > 0) {
			console.log("📝 First booking details:", bookings[0]);
			console.log("👥 First booking attendees:", bookings[0].attendees);
		}

		res.json({ bookings });
	} catch (error) {
		console.error("❌ Fetch Bookings Error:", error);

		// Check if it's an authentication error (401 Unauthorized)
		if (
			error.code === 401 ||
			error.status === 401 ||
			(error.response && error.response.status === 401)
		) {
			console.log(
				"🔐 Authentication error detected - updating user calendar status to not_connected",
			);

			try {
				// Update user's Google Calendar integration status to not_connected
				await User.findByIdAndUpdate(userId, {
					googleCalendarIntegrationStatus: "not_connected",
					googleCalendarAccessToken: null,
					googleCalendarRefreshToken: null,
					googleCalendarTokenExpiry: null,
				});
				console.log(
					"✅ User calendar integration status updated to not_connected",
				);
			} catch (updateError) {
				console.error("❌ Failed to update user calendar status:", updateError);
			}

			return res.status(401).json({
				message:
					"Google Calendar authentication expired. Please reconnect your Google Calendar.",
				code: "AUTH_EXPIRED",
			});
		}

		res.status(500).json({ message: "Failed to fetch bookings" });
	}
});

// Route to get user bookings from database
router.get("/user-bookings", auth, async (req, res) => {
	try {
		const userId = req.user.userId;
		const Booking = require("../models/Booking");

		const bookings = await Booking.find({
			userId,
			status: "active",
		})
			.populate("conversationId", "senderId platform")
			.sort({ createdAt: -1 })
			.limit(50); // Limit to prevent large responses

		console.log(`📋 Retrieved ${bookings.length} bookings for user ${userId}`);

		res.json({
			bookings: bookings.map((booking) => ({
				id: booking._id,
				eventId: booking.eventId,
				conversationId: booking.conversationId._id,
				senderId: booking.senderId,
				platform: booking.platform,
				summary: booking.summary,
				description: booking.description,
				start: booking.start,
				end: booking.end,
				attendees: booking.attendees,
				createdAt: booking.createdAt,
			})),
		});
	} catch (error) {
		console.error("❌ Error fetching user bookings:", error);
		res.status(500).json({ message: "Failed to fetch bookings" });
	}
});

// Route to create a calendar event
router.post("/events", auth, async (req, res) => {
	console.log("📅 API: Creating calendar event via endpoint");
	try {
		const userId = req.user.userId;
		console.log(`👤 API: Processing for user ${userId}`);
		const user = await User.findById(userId);
		if (!user || user.googleCalendarIntegrationStatus !== "connected") {
			console.log("❌ API: Google Calendar not connected");
			return res.status(400).json({ message: "Google Calendar not connected" });
		}
		console.log("✅ API: User has Google Calendar connected");
		// Refresh token if needed
		const accessToken = await refreshAccessTokenIfNeeded(user);
		console.log("🔧 API: Setting OAuth credentials");
		// Set credentials
		oauth2Client.setCredentials({ access_token: accessToken });
		// Get calendar API
		const calendar = google.calendar({ version: "v3", auth: oauth2Client });
		console.log("📅 API: Calendar API initialized");

		// Get business info for title formatting
		const Business = require("../models/Business");
		const businessInfo = await Business.findOne({ user: userId });

		// Get event data from request body
		const { summary, description, start, end, location, attendees } = req.body;
		console.log(
			`📝 API: Event details - Summary: "${summary}", Start: ${start}, End: ${end}`,
		);
		if (!summary || !start || !end) {
			console.log("❌ API: Missing required fields");
			return res
				.status(400)
				.json({ message: "Summary, start, and end are required" });
		}

		// Format title and description
		const bookingTitle =
			businessInfo && businessInfo.businessName
				? `Booking with ${businessInfo.businessName} : ${summary}`
				: `Booking: ${summary}`;

		const bookingDescription = description
			? `${description}\n\nMeeting was booked with "ginivo.ai"`
			: 'Meeting was booked with "ginivo.ai"';

		// Create event
		const event = {
			summary: bookingTitle,
			description: bookingDescription,
			start,
			end,
			location,
			attendees,
		};
		console.log("📅 API: Inserting event into Google Calendar...");
		const response = await calendar.events.insert({
			calendarId: "primary",
			resource: event,
		});
		console.log(
			`✅ API: Event created successfully with ID ${response.data.id}`,
		);
		// Return created event
		const createdEvent = {
			id: response.data.id,
			summary: response.data.summary,
			description: response.data.description,
			start: response.data.start,
			end: response.data.end,
			status: response.data.status,
			location: response.data.location,
			attendees: response.data.attendees,
			created: response.data.created,
			updated: response.data.updated,
		};
		res.status(201).json({ event: createdEvent });
	} catch (error) {
		console.error("❌ API: Create Event Error:", error);
		res.status(500).json({ message: "Failed to create calendar event" });
	}
});

// Disconnect Google Calendar
router.post("/disconnect", auth, async (req, res) => {
	try {
		const user = await User.findById(req.user.userId);

		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		console.log("🔄 Disconnecting Google Calendar for user:", user.email);

		// Optionally revoke the token with Google
		if (user.googleCalendarAccessToken) {
			try {
				oauth2Client.setCredentials({
					access_token: user.googleCalendarAccessToken,
				});
				await oauth2Client.revokeCredentials();
				console.log("✅ Google Calendar token revoked");
			} catch (revokeError) {
				console.error("⚠️ Failed to revoke Google token:", revokeError);
				// Continue with disconnect even if revoke fails
			}
		}

		// Clear all Google Calendar data
		user.googleCalendarAccessToken = null;
		user.googleCalendarRefreshToken = null;
		user.googleCalendarTokenExpiry = null;
		user.googleCalendarEmail = null;
		user.googleCalendarIntegrationStatus = "not_connected";

		await user.save();

		console.log("✅ Google Calendar disconnected successfully");

		res.json({
			message: "Google Calendar disconnected successfully",
			googleCalendarIntegrationStatus: "not_connected",
		});
	} catch (error) {
		console.error("❌ Disconnect Google Calendar error:", error);
		res.status(500).json({
			message: "Failed to disconnect Google Calendar",
		});
	}
});

module.exports = router;
