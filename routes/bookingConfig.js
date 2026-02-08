const express = require("express");
const BookingConfig = require("../models/BookingConfig");
const Business = require("../models/Business");
const auth = require("../middleware/auth");
const OpenAI = require("openai");

const router = express.Router();

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to validate field data
const validateField = (field) => {
	if (!field.fieldName || typeof field.fieldName !== "string") {
		return "Field name is required and must be a string";
	}
	if (
		!["text", "email", "phone", "number", "select"].includes(field.fieldType)
	) {
		return "Field type must be one of: text, email, phone, number, select";
	}
	if (
		field.fieldType === "select" &&
		(!Array.isArray(field.options) || field.options.length === 0)
	) {
		return "Select fields must have at least one option";
	}
	return null;
};

// GET current booking config
router.get("/", auth, async (req, res) => {
	console.log("\n📋 GET BOOKING CONFIG ROUTE HIT");
	console.log("👤 User ID from token:", req.user.userId);

	try {
		// Check if business exists
		const business = await Business.findOne({ user: req.user.userId });
		if (!business) {
			return res.status(404).json({
				message:
					"Business information not found. Please create business information first.",
			});
		}

		// Find booking config for this business
		let bookingConfig = await BookingConfig.findOne({ business: business._id });

		// If no config exists, create default config
		if (!bookingConfig) {
			bookingConfig = new BookingConfig({
				business: business._id,
				user: req.user.userId,
				rawInstructions: "",
				generatedPrompt: "",
				requiredFields: [
					{
						fieldName: "Name",
						fieldType: "text",
						isRequired: true,
						description: "Customer full name",
					},
					{
						fieldName: "Email",
						fieldType: "email",
						isRequired: true,
						description: "Customer email address",
					},
				],
				settings: {
					bufferTime: 0,
					advanceBookingDays: 30,
					maxAdvanceBookingDays: 30,
					sameDayBooking: true,
					allowSameDayBooking: true,
					bookingNotifications: true,
					confirmationEmailEnabled: true,
					cancellationPolicy: "",
				},
			});
			await bookingConfig.save();
		}

		res.json({
			message: "Booking config retrieved successfully.",
			bookingConfig,
		});
	} catch (error) {
		console.error("❌ Error retrieving booking config:", error);
		res.status(500).json({
			message: "Failed to retrieve booking config.",
			error: error.message,
		});
	}
});

// PUT update booking config (without AI analysis)
router.put("/", auth, async (req, res) => {
	console.log("\n📝 UPDATE BOOKING CONFIG ROUTE HIT");
	console.log("📦 Request body:", JSON.stringify(req.body, null, 2));
	console.log("👤 User ID from token:", req.user.userId);

	try {
		const { rawInstructions, requiredFields, settings } = req.body;

		// Check if business exists
		const business = await Business.findOne({ user: req.user.userId });
		if (!business) {
			return res.status(404).json({
				message:
					"Business information not found. Please create business information first.",
			});
		}

		// Find or create booking config
		let bookingConfig = await BookingConfig.findOne({ business: business._id });
		if (!bookingConfig) {
			bookingConfig = new BookingConfig({
				business: business._id,
				user: req.user.userId,
			});
		}

		// Update fields
		if (rawInstructions !== undefined) {
			bookingConfig.rawInstructions = rawInstructions;
		}
		if (requiredFields !== undefined) {
			// Validate fields
			for (let field of requiredFields) {
				const error = validateField(field);
				if (error) {
					return res.status(400).json({ message: error });
				}
			}
			bookingConfig.requiredFields = requiredFields;
		}
		if (settings !== undefined) {
			bookingConfig.settings = {
				...bookingConfig.settings.toObject(),
				...settings,
			};
		}

		await bookingConfig.save();

		res.json({
			message: "Booking config updated successfully.",
			bookingConfig,
		});
	} catch (error) {
		console.error("❌ Error updating booking config:", error);
		res.status(500).json({
			message: "Failed to update booking config.",
			error: error.message,
		});
	}
});

// POST analyze instructions with AI
router.post("/analyze", auth, async (req, res) => {
	console.log("\n🤖 ANALYZE BOOKING INSTRUCTIONS ROUTE HIT");
	console.log("📦 Request body:", JSON.stringify(req.body, null, 2));
	console.log("👤 User ID from token:", req.user.userId);

	try {
		const { rawInstructions } = req.body;

		if (!rawInstructions || rawInstructions.trim() === "") {
			return res.status(400).json({
				message: "Raw instructions are required.",
			});
		}

		// Check if business exists
		const business = await Business.findOne({ user: req.user.userId });
		if (!business) {
			return res.status(404).json({
				message:
					"Business information not found. Please create business information first.",
			});
		}

		// Call OpenAI to analyze and generate structured booking prompt
		const completion = await openai.chat.completions.create({
			model: "gpt-4o",
			messages: [
				{
					role: "system",
					content: `You are an expert at creating SUPPLEMENTARY booking instructions for an AI booking agent.

IMPORTANT CONTEXT: The AI agent ALREADY has full booking capabilities including:
- Checking available time slots
- Creating bookings in the calendar
- Collecting customer information (name, email, purpose)
- Managing cancellations

Your task is to generate ADDITIONAL instructions that customize the booking experience based on the business owner's preferences. These instructions will be ADDED to the existing booking flow.

Focus on:
1. **Additional Information to Collect**: Any extra fields beyond name/email/purpose (e.g., phone number, special requirements, package preferences)
2. **Conversation Tone & Style**: How should the agent communicate? (formal, casual, enthusiastic, etc.)
3. **Special Policies**: Cancellation rules, deposit requirements, preparation instructions for customers
4. **Booking Restrictions**: Any specific rules (e.g., "require 48-hour notice", "no same-day bookings", "ask about allergies for spa services")

DO NOT:
- Say "bookings cannot be made through this service" or "must call to book" (the agent CAN book)
- Repeat basic booking flow instructions (the agent already knows how)
- Be overly verbose

Format as concise, direct instructions. Use "you" to address the agent. Start with "ADDITIONAL BOOKING REQUIREMENTS:" as the header.`,
				},
				{
					role: "user",
					content: `Analyze these booking preferences and create structured instructions for the AI booking agent:\n\n${rawInstructions}`,
				},
			],
			temperature: 0.7,
			max_tokens: 1000,
		});

		const generatedPrompt = completion.choices[0].message.content;

		// Find or create booking config
		let bookingConfig = await BookingConfig.findOne({ business: business._id });
		if (!bookingConfig) {
			bookingConfig = new BookingConfig({
				business: business._id,
				user: req.user.userId,
			});
		}

		// Update with analyzed instructions
		bookingConfig.rawInstructions = rawInstructions;
		bookingConfig.generatedPrompt = generatedPrompt;
		bookingConfig.promptLastGeneratedAt = new Date();

		await bookingConfig.save();

		res.json({
			message: "Instructions analyzed successfully.",
			bookingConfig: {
				rawInstructions: bookingConfig.rawInstructions,
				generatedPrompt: bookingConfig.generatedPrompt,
				promptLastGeneratedAt: bookingConfig.promptLastGeneratedAt,
			},
		});
	} catch (error) {
		console.error("❌ Error analyzing instructions:", error);
		console.error("Error details:", {
			message: error.message,
			stack: error.stack,
			response: error.response?.data,
		});
		res.status(500).json({
			message: "Failed to analyze instructions.",
			error: error.message,
			details: error.response?.data?.error?.message || "Unknown error",
		});
	}
});

// PUT update just the custom required fields
router.put("/fields", auth, async (req, res) => {
	console.log("\n📝 UPDATE BOOKING FIELDS ROUTE HIT");
	console.log("📦 Request body:", JSON.stringify(req.body, null, 2));
	console.log("👤 User ID from token:", req.user.userId);

	try {
		const { requiredFields } = req.body;

		if (!Array.isArray(requiredFields)) {
			return res.status(400).json({
				message: "Required fields must be an array.",
			});
		}

		// Validate fields
		for (let field of requiredFields) {
			const error = validateField(field);
			if (error) {
				return res.status(400).json({ message: error });
			}
		}

		// Check if business exists
		const business = await Business.findOne({ user: req.user.userId });
		if (!business) {
			return res.status(404).json({
				message:
					"Business information not found. Please create business information first.",
			});
		}

		// Find or create booking config
		let bookingConfig = await BookingConfig.findOne({ business: business._id });
		if (!bookingConfig) {
			bookingConfig = new BookingConfig({
				business: business._id,
				user: req.user.userId,
			});
		}

		bookingConfig.requiredFields = requiredFields;
		await bookingConfig.save();

		res.json({
			message: "Required fields updated successfully.",
			bookingConfig,
		});
	} catch (error) {
		console.error("❌ Error updating fields:", error);
		res.status(500).json({
			message: "Failed to update fields.",
			error: error.message,
		});
	}
});

// PUT update just the settings
router.put("/settings", auth, async (req, res) => {
	console.log("\n⚙️ UPDATE BOOKING SETTINGS ROUTE HIT");
	console.log("📦 Request body:", JSON.stringify(req.body, null, 2));
	console.log("👤 User ID from token:", req.user.userId);

	try {
		const { settings } = req.body;

		if (!settings || typeof settings !== "object") {
			return res.status(400).json({
				message: "Settings object is required.",
			});
		}

		// Check if business exists
		const business = await Business.findOne({ user: req.user.userId });
		if (!business) {
			return res.status(404).json({
				message:
					"Business information not found. Please create business information first.",
			});
		}

		// Find or create booking config
		let bookingConfig = await BookingConfig.findOne({ business: business._id });
		if (!bookingConfig) {
			bookingConfig = new BookingConfig({
				business: business._id,
				user: req.user.userId,
			});
		}

		// Update settings
		bookingConfig.settings = {
			...bookingConfig.settings.toObject(),
			...settings,
		};
		await bookingConfig.save();

		res.json({
			message: "Settings updated successfully.",
			bookingConfig,
		});
	} catch (error) {
		console.error("❌ Error updating settings:", error);
		res.status(500).json({
			message: "Failed to update settings.",
			error: error.message,
		});
	}
});

module.exports = router;
