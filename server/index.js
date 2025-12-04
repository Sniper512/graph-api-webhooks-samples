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

// Import models
const Conversation = require("../models/Conversation");

const app = express();

app.set("port", process.env.PORT || 5000);

// Connect to MongoDB
mongoose
	.connect(process.env.DB_URL)
	.then(() => {
		console.log("Connected to MongoDB");
		// Archive old conversations daily
		setInterval(() => {
			Conversation.archiveOldConversations()
				.then(() => console.log("✅ Old conversations archived"))
				.catch(err => console.error("❌ Error archiving conversations:", err));
		}, 24 * 60 * 60 * 1000); // Run daily
	})
	.catch((err) => console.error("MongoDB connection error:", err));

app.listen(app.get("port"));

// CORS configuration - allow all origins
app.use(
	cors({
		origin: true,
		credentials: true,
		methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Key"],
	})
);

app.use(xhub({ algorithm: "sha1", secret: process.env.APP_SECRET }));
app.use(bodyParser.json());

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

var token = process.env.TOKEN || "token";
var received_updates = [];

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

		const requestBody = {
			model: OPENAI_MODEL,
			messages: messages,
			max_tokens: 300,
		};

		// Only add temperature if not using o1 models
		if (!OPENAI_MODEL.startsWith("o1")) {
			requestBody.temperature = 0.7;
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

		const aiResponse = response.data.choices[0].message.content;
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
