/**
 * Copyright 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

require("dotenv").config();

const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const express = require("express");
const cors = require("cors");
const xhub = require("express-x-hub");
const axios = require("axios");

// Import routes
const authRoutes = require("../routes/auth");
const instagramRoutes = require("../routes/instagram");
const businessRoutes = require("../routes/business");
const faqRoutes = require("../routes/faqs");
const adminRoutes = require("../routes/admin");
const timeSlotRoutes = require("../routes/timeslots");
const googleCalendarRoutes = require("../routes/googleCalendar");

// Import models
const Conversation = require("../models/Conversation");
const { google } = require('googleapis');

const app = express();

app.set("port", process.env.PORT || 5000);

// Connect to MongoDB
mongoose
	.connect(process.env.DB_URL)
	.then(() => {
		console.log("Connected to MongoDB");
		// Note: Auto-archiving disabled for MVP - keeping all conversation history
		// Uncomment below to enable auto-archiving after 7 days:
		// setInterval(() => {
		// 	Conversation.archiveOldConversations()
		// 		.then(() => console.log("✅ Old conversations archived"))
		// 		.catch(err => console.error("❌ Error archiving conversations:", err));
		// }, 24 * 60 * 60 * 1000); // Run daily
	})
	.catch((err) => console.error("MongoDB connection error:", err));

app.listen(app.get("port"));

// CORS configuration - allow multiple origins
const allowedOrigins = [
	'http://localhost:5173',
	'http://localhost:3000',
	'https://meta-user-dashboard.vercel.app',
	'https://meta-app-admin-dashboard.vercel.app',
	process.env.FRONTEND_URL,
	process.env.ADMIN_FRONTEND_URL
].filter(Boolean);

app.use(
	cors({
		origin: function (origin, callback) {
			// Allow requests with no origin (mobile apps, Postman, etc.)
			if (!origin) return callback(null, true);
			
			if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
				callback(null, true);
			} else {
				callback(null, true); // Allow all origins for now
			}
		},
		credentials: true,
		methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Key"],
	})
);

app.use(xhub({ algorithm: "sha1", secret: process.env.APP_SECRET }));


app.use(bodyParser.json());

// Session middleware for storing temporary data
const session = require('express-session');
app.use(session({
  secret: process.env.APP_SECRET || 'your_session_secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Mount auth routes
app.use("/api/auth", authRoutes);

// Mount Instagram routes
app.use("/api/instagram", instagramRoutes);

// Mount business routes
app.use("/api/business", businessRoutes);

// Mount FAQ routes
app.use("/api/faqs", faqRoutes);

// Mount Admin routes
app.use("/api/admin", adminRoutes);

// Mount time slot routes
app.use("/api/timeslots", timeSlotRoutes);

// Mount Google Calendar routes
app.use("/api/google-calendar", googleCalendarRoutes);

var token = process.env.TOKEN || "token";
var received_updates = [];

// Tool functions for booking
async function refreshAccessTokenIfNeeded(user) {
  const now = new Date();
  if (user.googleCalendarTokenExpiry && user.googleCalendarTokenExpiry <= now) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CALENDAR_CLIENT_ID,
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      process.env.GOOGLE_CALENDAR_REDIRECT_URI
    );
    oauth2Client.setCredentials({ refresh_token: user.googleCalendarRefreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();
    user.googleCalendarAccessToken = credentials.access_token;
    user.googleCalendarTokenExpiry = new Date(credentials.expiry_date);
    await user.save();
  }
  return user.googleCalendarAccessToken;
}

// Helper function to generate proper date ranges for booking
function generateBookingDateRange() {
  const today = new Date();
  const startDate = new Date(today);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 14); // Next 14 days
  
  const formatISODate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  return {
    startDate: formatISODate(startDate),
    endDate: formatISODate(endDate)
  };
}
async function getAvailableBookingSlots(userId, startDate, endDate) {
  try {
    const Business = require("../models/Business");
    const business = await Business.findOne({ user: userId });
    if (!business) return { availableSlots: [] };
    const TimeSlot = require("../models/TimeSlot");
    const timeSlots = await TimeSlot.find({ business: business._id, isActive: true });
    const User = require("../models/User");
    const user = await User.findById(userId);
    let bookings = [];
    if (user && user.googleCalendarIntegrationStatus === 'connected') {
      const accessToken = await refreshAccessTokenIfNeeded(user);
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CALENDAR_CLIENT_ID,
        process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
        process.env.GOOGLE_CALENDAR_REDIRECT_URI
      );
      oauth2Client.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      const timeMin = new Date(startDate + 'T00:00:00Z').toISOString();
      const timeMax = new Date(endDate + 'T23:59:59Z').toISOString();
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime'
      });
      bookings = response.data.items.filter(event => {
        const summary = (event.summary || '').toLowerCase();
        const description = (event.description || '').toLowerCase();
        return summary.includes('booking') || description.includes('booking');
      });
    }
    const availableSlots = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      const daySlots = timeSlots.filter(ts => ts.dayOfWeek === dayOfWeek);
      for (const ts of daySlots) {
        for (const slot of ts.slots) {
          if (!slot.isActive) continue;
          const slotStart = new Date(d.toISOString().split('T')[0] + 'T' + slot.startTime + ':00Z');
          const slotEnd = new Date(d.toISOString().split('T')[0] + 'T' + slot.endTime + ':00Z');
          let isAvailable = true;
          for (const booking of bookings) {
            const bStart = new Date(booking.start.dateTime || booking.start.date);
            const bEnd = new Date(booking.end.dateTime || booking.end.date);
            if (slotStart < bEnd && slotEnd > bStart) {
              isAvailable = false;
              break;
            }
          }
          if (isAvailable) {
            availableSlots.push({
              date: d.toISOString().split('T')[0],
              startTime: slot.startTime,
              endTime: slot.endTime,
              duration: slot.duration
            });
          }
        }
      }
    }
    return { availableSlots };
  } catch (error) {
    console.error('Error getting available slots:', error);
    return { availableSlots: [] };
  }
}
async function createBooking(userId, summary, start, end, description, attendeeEmail, attendeeName) {
  try {
    const User = require("../models/User");
    const user = await User.findById(userId);
    if (!user || user.googleCalendarIntegrationStatus !== 'connected') {
      return { error: "Google Calendar not connected" };
    }
    const accessToken = await refreshAccessTokenIfNeeded(user);
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CALENDAR_CLIENT_ID,
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      process.env.GOOGLE_CALENDAR_REDIRECT_URI
    );
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Get user's timezone from Google Calendar
    const calendarInfo = await calendar.calendars.get({
      calendarId: 'primary'
    });
    const timezone = calendarInfo.data.timeZone || 'UTC';
    
    const event = {
      summary: `Booking: ${summary}`,
      description,
      start: {
        dateTime: start,
        timeZone: timezone
      },
      end: {
        dateTime: end,
        timeZone: timezone
      },
      attendees: attendeeEmail ? [{ email: attendeeEmail, displayName: attendeeName }] : []
    };
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event
    });
    return { eventId: response.data.id, status: 'created' };
  } catch (error) {
    console.error('Error creating booking:', error);
    return { error: 'Failed to create booking' };
  }
}
// OpenAI API Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5";

// Function to get OpenAI response
async function getOpenAIResponse(userMessage, senderId, userId, platform = 'instagram') {
	try {
		console.log(`\n🤖 Sending to OpenAI (${OPENAI_MODEL})...`);
		console.log(`📝 User message: "${userMessage}"`);
		console.log(`👤 User ID: ${userId}`);

		// Get or create conversation from database
		const conversation = await Conversation.findOrCreate(senderId, platform, userId);
		const conversationHistory = conversation.getRecentMessages(10);

		// Fetch user-specific business information and FAQs from database
		let businessInfo = "";
		let faqContent = "";

		if (userId) {
			// Fetch business information
			const Business = require("../models/Business");
			const business = await Business.findOne({ user: userId });

			if (business) {
				businessInfo =
					`${business.businessName}, a ${business.businessCategory} company. ` +
					`Contact us at ${business.email}` +
					(business.phoneNumber ? ` or call ${business.phoneNumber}` : "") +
					(business.website ? `. Visit our website: ${business.website}` : "") +
					(business.businessDescription
						? `. ${business.businessDescription}`
						: "") +
					(business.address ? `. We're located at: ${business.address}` : "");
			} else {
				businessInfo = "our business";
			}

			// Fetch FAQs
			const FAQ = require("../models/FAQ");
			const faqs = await FAQ.find({ user: userId }).sort({ createdAt: -1 });

			if (faqs.length > 0) {
				faqContent = "\n\n## BUSINESS FAQS\n\n";
				faqs.forEach((faq, index) => {
					faqContent += `**${faq.question}**\n${faq.answer}\n\n`;
				});
			} else {
				faqContent = "\n\n## BUSINESS FAQS\n\nNo FAQs have been added yet.\n\n";
			}
		}

		// Generate proper date range for booking
		const bookingDateRange = generateBookingDateRange();
		
		// Build messages array with conversation history
		const messages = [
			{
				role: "system",
				content:
					`You are representing ${businessInfo}. ` +
					"You are a helpful assistant that answers questions about the business. " +
					"Use ONLY the following FAQs to answer questions when possible. " +
					"IMPORTANT: Keep your responses concise and under 2000 characters total. " +
					"If providing multiple FAQ answers, limit to 2-3 most relevant ones. " +
					"Be helpful but brief - Instagram has message length limits. " +
					"CRITICAL: Never use any external knowledge, training data, or generic information. " +
					"If you don't have specific information about something in the provided business info or FAQs, " +
					"respond ONLY with: 'I don't have that specific information right now. " +
					"One of our team members will connect with you shortly to provide the details you need.' " +
					"Do NOT provide ANY generic, assumed, or external information about addresses, or businesses. " +
					"CONTEXT AWARENESS: You have access to the full conversation history. " +
					"Use previous messages to maintain context and provide relevant responses. " +
					"Reference earlier parts of the conversation when appropriate." +
					`BOOKING ASSISTANCE: If a user expresses interest in booking an appointment, scheduling a session, or making a reservation, follow these steps: 1. Use the get_available_booking_slots tool to retrieve available time slots for the next 7-14 days. Use the date range: startDate=${bookingDateRange.startDate}, endDate=${bookingDateRange.endDate}. IMPORTANT: Always use the current year (${new Date().getFullYear()}) when generating dates. 2. Present 3-5 available options to the user in a clear, easy-to-read format. When presenting dates, ALWAYS include the day of the week in the format: "Day, Month Date, Year" (e.g., "Monday, December 16, 2025"). DO NOT omit the day of the week under any circumstances. 3. BEFORE creating a booking, you MUST collect the following information from the user: - Full name (required) - Contact number/email (required) - Purpose of the appointment (required) 4. Ask the user to confirm which time works best for them. 5. Once they confirm a specific time AND you have all required information, use the create_booking tool to create the booking. If any required information is missing, do NOT proceed with booking and instead ask the user to provide the missing details.` +
						faqContent,
			},
		];

		// Add conversation history from database
		conversationHistory.forEach((msg) => {
			if (msg.role !== 'system') {
				messages.push({
					role: msg.role,
					content: msg.content,
				});
			}
		});

		// Add current user message
		messages.push({
		  role: "user",
		  content: userMessage,
		});

		// Function definitions for tool calls
		const tools = [
		  {
		    type: "function",
		    function: {
		      name: "get_available_booking_slots",
		      description: "Get available time slots for booking appointments with the business",
		      parameters: {
		        type: "object",
		        properties: {
		          startDate: { type: "string", description: "Start date in YYYY-MM-DD format" },
		          endDate: { type: "string", description: "End date in YYYY-MM-DD format" }
		        },
		        required: ["startDate", "endDate"]
		      }
		    }
		  },
		  {
		    type: "function",
		    function: {
		      name: "create_booking",
		      description: "Create a new booking appointment on the calendar",
		      parameters: {
		        type: "object",
		        properties: {
		          summary: { type: "string", description: "Booking title or service type" },
		          start: { type: "string", description: "Start time in ISO 8601 format (e.g., 2023-12-01T10:00:00Z)" },
		          end: { type: "string", description: "End time in ISO 8601 format" },
		          description: { type: "string", description: "Additional details about the booking" },
		          attendeeEmail: { type: "string", description: "Email of the person booking" },
		          attendeeName: { type: "string", description: "Name of the person booking" }
		        },
		        required: ["summary", "start", "end"]
		      }
		    }
		  }
		];

		// Function to make API call and handle responses
		async function makeOpenAICall(msgs, toolCalls = null) {
			const requestBody = {
			  model: OPENAI_MODEL,
			  messages: msgs,
			  max_completion_tokens: 500,
			};



			// Add tools only if not in a function call response
			if (!toolCalls) {
				requestBody.tools = tools;
			}

			const response = await axios.post(
				"https://api.openai.com/v1/chat/completions",
				requestBody,
				{
					headers: {
						Authorization: `Bearer ${OPENAI_API_KEY}`,
						"Content-Type": "application/json",
					},
				}
			);

			return response.data;
		}

		// Make initial API call
		let response = await makeOpenAICall(messages);
		let aiResponse = "";
		let maxToolCalls = 3; // Prevent infinite loops
		let toolCallCount = 0;

		// Handle function calls in a loop
		while (response.choices[0].message.tool_calls &&
			   response.choices[0].message.tool_calls.length > 0 &&
			   toolCallCount < maxToolCalls) {
			
			toolCallCount++;
			const choice = response.choices[0];
			const toolCalls = choice.message.tool_calls;
			
			console.log(`\n🔧 Function call detected: ${toolCalls[0].function.name}`);
			
			// Add the assistant's message with tool calls to the conversation
			messages.push(choice.message);
			
			// Execute each tool call and add results to messages
			for (const toolCall of toolCalls) {
				const functionName = toolCall.function.name;
				const functionArgs = JSON.parse(toolCall.function.arguments || "{}");
				
				try {
					let toolResult = "";
					
					if (functionName === "get_available_booking_slots") {
						// Use provided dates or generate default range
						let startDate = functionArgs.startDate;
						let endDate = functionArgs.endDate;
						
						// Validate dates - if invalid or missing, use current year
						const currentDate = new Date();
						const currentYear = currentDate.getFullYear();
						
						if (!startDate || !endDate) {
							const dateRange = generateBookingDateRange();
							startDate = dateRange.startDate;
							endDate = dateRange.endDate;
						} else {
							// Ensure dates use current year
							const startYear = startDate.substring(0, 4);
							const endYear = endDate.substring(0, 4);
							
							if (startYear !== currentYear.toString()) {
								startDate = currentYear + startDate.substring(4);
							}
							if (endYear !== currentYear.toString()) {
								endDate = currentYear + endDate.substring(4);
							}
						}
						
						const slots = await getAvailableBookingSlots(userId, startDate, endDate);
						toolResult = JSON.stringify(slots);
					} else if (functionName === "create_booking") {
						const booking = await createBooking(
							userId,
							functionArgs.summary,
							functionArgs.start,
							functionArgs.end,
							functionArgs.description || "",
							functionArgs.attendeeEmail,
							functionArgs.attendeeName
						);
						toolResult = JSON.stringify(booking);
					} else {
						toolResult = JSON.stringify({ error: "Unknown function" });
					}
					
					// Add tool result to messages
					messages.push({
						role: "tool",
						tool_call_id: toolCall.id,
						content: toolResult
					});
					
				} catch (toolError) {
					console.error(`\n❌ Tool execution error:`, toolError);
					messages.push({
						role: "tool",
						tool_call_id: toolCall.id,
						content: JSON.stringify({ error: toolError.message || "Tool execution failed" })
					});
				}
			}
			
			// Make another API call with tool results
			response = await makeOpenAICall(messages, toolCalls);
		}

		// Get final response
		const finalChoice = response.choices[0];
		aiResponse = finalChoice.message.content || "I'm not sure how to respond to that.";

		console.log(`\n✅ OpenAI Response:\n${aiResponse}\n`);

		// Save both messages to database
		await conversation.addMessage('user', userMessage);
		await conversation.addMessage('assistant', aiResponse);

		return aiResponse;
	} catch (error) {
		console.error(
			"\n❌ OpenAI API Error:",
			error.response?.data || error.message
		);
		return "Sorry, I'm having trouble processing your message right now. Please try again later.";
	}
}

// Function to send Instagram message
async function sendInstagramMessage(
	recipientId,
	messageText,
	accessToken,
	accountId
) {
	try {
		const response = await axios.post(
			`https://graph.instagram.com/v24.0/${accountId}/messages`,
			{
				recipient: {
					id: recipientId,
				},
				message: {
					text: messageText,
				},
			},
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
			}
		);
		console.log("Instagram message sent successfully:", response.data);
		return response.data;
	} catch (error) {
		console.error(
			"Instagram Send API Error:",
			error.response?.data || error.message
		);
		throw error;
	}
// Function to fetch Instagram user profile
async function getInstagramUserProfile(userId, accessToken) {
	try {
		const response = await axios.get(
			`https://graph.instagram.com/${userId}?fields=username&access_token=${accessToken}`
		);
		return {
			username: response.data.username,
			profilePicture: null // Profile pictures not available for IG Business scoped IDs
		};
	} catch (error) {
		console.error(
			"Instagram User Profile API Error:",
			error.response?.data || error.message
		);
		return {
			username: null,
			profilePicture: null
		};
	}
}
}

// Function to send WhatsApp message
async function sendWhatsAppMessage(recipientId, messageText) {
	try {
		const response = await axios.post(
			`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONENUM_ID}/messages`,
			{
				messaging_product: "whatsapp",
				to: recipientId,
				type: "text",
				text: {
					body: messageText,
				},
			},
			{
				headers: {
					Authorization: `Bearer ${process.env.WHATSAPP_ACCOUNT_ACCESS_TOKEN}`,
					"Content-Type": "application/json",
				},
			}
		);
		console.log("WhatsApp message sent successfully:", response.data);
		return response.data;
	} catch (error) {
		console.error(
			"WhatsApp Send API Error:",
			error.response?.data || error.message
		);
		throw error;
	}
}

app.get("/", function (req, res) {
	console.log(req);
	res.send("<pre>" + JSON.stringify(received_updates, null, 2) + "</pre>");
});

app.get("/privacy-policy", function (req, res) {
	res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Privacy Policy</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; line-height: 1.6; }
        h1 { color: #333; }
        h2 { color: #555; margin-top: 30px; }
        p { color: #666; }
      </style>
    </head>
    <body>
      <h1>Privacy Policy</h1>
      <p><strong>Last Updated:</strong> October 28, 2025</p>
      
      <h2>1. Information We Collect</h2>
      <p>We collect information you provide when you interact with our Instagram bot, including:</p>
      <ul>
        <li>Instagram username and profile information</li>
        <li>Messages you send to our Instagram account</li>
        <li>Message timestamps and metadata</li>
      </ul>
      
      <h2>2. How We Use Your Information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Respond to your messages and inquiries</li>
        <li>Improve our service and user experience</li>
        <li>Comply with legal obligations</li>
      </ul>
      
      <h2>3. Data Retention</h2>
      <p>We retain your information only as long as necessary to provide our services and as required by law.</p>
      
      <h2>4. Data Security</h2>
      <p>We implement appropriate security measures to protect your information from unauthorized access, alteration, or disclosure.</p>
      
      <h2>5. Third-Party Services</h2>
      <p>Our service uses Instagram's Messaging API provided by Meta Platforms, Inc. Your use of Instagram is also subject to Instagram's Terms of Service and Privacy Policy.</p>
      
      <h2>6. Your Rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access your personal information</li>
        <li>Request deletion of your data</li>
        <li>Opt-out of communications</li>
      </ul>
      
      <h2>7. Contact Us</h2>
      <p>If you have questions about this Privacy Policy, please contact us through Instagram Direct Messages.</p>
      
      <h2>8. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.</p>
    </body>
    </html>
  `);
});

app.get("/facebook", function (req, res) {
	if (
		req.query["hub.mode"] == "subscribe" &&
		req.query["hub.verify_token"] == token
	) {
		res.send(req.query["hub.challenge"]);
	} else {
		res.sendStatus(400);
	}
});

app.get("/instagram", function (req, res) {
	if (
		req.query["hub.mode"] == "subscribe" &&
		req.query["hub.verify_token"] == token
	) {
		res.send(req.query["hub.challenge"]);
	} else {
		res.sendStatus(400);
	}
});

app.get("/threads", function (req, res) {
	if (
		req.query["hub.mode"] == "subscribe" &&
		req.query["hub.verify_token"] == token
	) {
		res.send(req.query["hub.challenge"]);
	} else {
		res.sendStatus(400);
	}
});

app.get("/whatsapp", function (req, res) {
	if (
		req.query["hub.mode"] == "subscribe" &&
		req.query["hub.verify_token"] == token
	) {
		res.send(req.query["hub.challenge"]);
	} else {
		res.sendStatus(400);
	}
});

app.post("/facebook", function (req, res) {
	console.log("Facebook request body:", req.body);

	if (!req.isXHubValid()) {
		console.log(
			"Warning - request header X-Hub-Signature not present or invalid"
		);
		res.sendStatus(401);
		return;
	}

	console.log("request header X-Hub-Signature validated");
	// Process the Facebook updates here
	received_updates.unshift(req.body);
	res.sendStatus(200);
});

app.post("/instagram", async function (req, res) {
	console.log("Instagram request body:");
	console.log(JSON.stringify(req.body, null, 2));

	// Store the received update
	received_updates.unshift(req.body);

	// Respond to webhook immediately (required by Meta)
	res.sendStatus(200);

	// Process the message asynchronously
	try {
		if (req.body.object === "instagram") {
			for (const entry of req.body.entry) {
				if (entry.messaging) {
					for (const messagingEvent of entry.messaging) {
						// Check if it's an incoming message (not an echo)
						if (
							messagingEvent.message &&
							messagingEvent.message.text &&
							!messagingEvent.message.is_echo
						) {
							const senderId = messagingEvent.sender.id;
							console.log("=== Sender ===:", messagingEvent.sender);
							const recipientId = messagingEvent.recipient.id;
							const userMessage = messagingEvent.message.text;

							console.log(`\n📨 New Instagram Message:`);
							console.log(`   From: ${senderId}`);
							console.log(`   To: ${recipientId}`);
							console.log(`   Message: "${userMessage}"`);

							// Find the user by their Instagram account ID
							const User = require("../models/User");
							const user = await User.findOne({
								instagramAccountId: recipientId,
							});

						if (user && user.instagramAccessToken) {
							// Get AI response with conversation context (pass 'instagram' as platform)
							const aiResponse = await getOpenAIResponse(
								userMessage,
								senderId,
								user._id,
								'instagram'
							);

							// Send reply to Instagram using user's token
								try {
									console.log(`\n📤 Sending reply to Instagram...`);
									await sendInstagramMessage(
										senderId,
										aiResponse,
										user.instagramAccessToken,
										recipientId
									);
									console.log(`✅ Reply sent successfully!\n`);
								} catch (sendError) {
									console.log(`\n❌ Failed to send Instagram reply`);
									console.log(
										`💡 The user's Instagram Access Token may be expired or invalid`
									);
									console.log(
										`   User needs to update their token via /api/instagram/set-access-token\n`
									);
								}
							} else {
								console.log(
									`⚠️  Skipping - no user found with Instagram account ID ${recipientId} or no access token set\n`
								);
							}
						}
					}
				}
			}
		}
	} catch (error) {
		console.error("Error processing Instagram message:", error);
	}
});

app.post("/threads", function (req, res) {
	console.log("Threads request body:");
	console.log(req.body);
	// Process the Threads updates here
	received_updates.unshift(req.body);
	res.sendStatus(200);
});

app.post("/whatsapp", async function (req, res) {
	console.log("WhatsApp request body:");
	console.log(JSON.stringify(req.body, null, 2));

	// Store the received update
	received_updates.unshift(req.body);

	// Respond to webhook immediately (required by Meta)
	res.sendStatus(200);

	// Process the message asynchronously
	try {
		if (req.body.object === "whatsapp_business_account") {
			for (const entry of req.body.entry) {
				if (entry.changes) {
					for (const change of entry.changes) {
						if (change.value && change.value.messages) {
							for (const message of change.value.messages) {
								// Check if it's an incoming text message
								if (message.type === "text") {
									const senderId = message.from;
									const recipientId = change.value.metadata.phone_number_id;
									const userMessage = message.text.body;

									console.log(`\n📨 New WhatsApp Message:`);
									console.log(`   From: ${senderId}`);
									console.log(`   To: ${recipientId}`);
									console.log(`   Message: "${userMessage}"`);

									// Only process if message is sent TO your account
									console.log(
										`   Checking recipient: ${recipientId} vs ${process.env.WHATSAPP_PHONENUM_ID}`
									);
									if (recipientId === process.env.WHATSAPP_PHONENUM_ID) {
										// Get AI response with conversation context
										const aiResponse = await getOpenAIResponse(
											userMessage,
											senderId,
											null
										);

										// Send reply to WhatsApp (only if access token is configured and valid)
										if (
											process.env.WHATSAPP_ACCOUNT_ACCESS_TOKEN &&
											process.env.WHATSAPP_ACCOUNT_ACCESS_TOKEN !==
												"your_whatsapp_access_token_here" &&
											process.env.WHATSAPP_ACCOUNT_ACCESS_TOKEN.length > 50
										) {
											try {
												console.log(`\n📤 Sending reply to WhatsApp...`);
												await sendWhatsAppMessage(senderId, aiResponse);
												console.log(`✅ Reply sent successfully!\n`);
											} catch (sendError) {
												console.log(`\n❌ Failed to send WhatsApp reply`);
												console.log(
													`💡 Your WhatsApp Access Token may be expired or invalid`
												);
												console.log(
													`   Get a new token from Meta Developer Console\n`
												);
											}
										} else {
											console.log(
												`\n⚠️  WhatsApp Access Token not configured - Response displayed above only`
											);
											console.log(
												`💡 To enable auto-replies, get a valid WhatsApp Access Token from Meta Developer Console\n`
											);
										}
									} else {
										console.log(
											`⚠️  Skipping - message not sent to our account (recipient mismatch)\n`
										);
									}
								}
							}
						}
					}
				}
			}
		}
	} catch (error) {
		console.error("Error processing WhatsApp message:", error);
	}
});

app.listen();
