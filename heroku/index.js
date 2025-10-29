/**
 * Copyright 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

var bodyParser = require("body-parser");
var express = require("express");
var app = express();
var xhub = require("express-x-hub");
var axios = require("axios");

app.set("port", process.env.PORT || 5000);
app.listen(app.get("port"));

app.use(xhub({ algorithm: "sha1", secret: process.env.APP_SECRET }));
app.use(bodyParser.json());

var token = process.env.TOKEN || "token";
var received_updates = [];

// OpenAI API Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const INSTAGRAM_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID;

// Function to get OpenAI response
async function getOpenAIResponse(userMessage) {
	try {
		const response = await axios.post(
			"https://api.openai.com/v1/chat/completions",
			{
				model: "gpt-3.5-turbo",
				messages: [
					{
						role: "system",
						content: "You are a helpful assistant responding to Instagram messages. Be friendly, concise, and helpful."
					},
					{
						role: "user",
						content: userMessage
					}
				],
				max_tokens: 500,
				temperature: 0.7
			},
			{
				headers: {
					"Authorization": `Bearer ${OPENAI_API_KEY}`,
					"Content-Type": "application/json"
				}
			}
		);
		return response.data.choices[0].message.content;
	} catch (error) {
		console.error("OpenAI API Error:", error.response?.data || error.message);
		return "Sorry, I'm having trouble processing your message right now. Please try again later.";
	}
}

// Function to send Instagram message
async function sendInstagramMessage(recipientId, messageText) {
	try {
		const response = await axios.post(
			`https://graph.facebook.com/v21.0/${INSTAGRAM_ACCOUNT_ID}/messages`,
			{
				recipient: {
					id: recipientId
				},
				message: {
					text: messageText
				}
			},
			{
				headers: {
					"Authorization": `Bearer ${INSTAGRAM_ACCESS_TOKEN}`,
					"Content-Type": "application/json"
				}
			}
		);
		console.log("Instagram message sent successfully:", response.data);
		return response.data;
	} catch (error) {
		console.error("Instagram Send API Error:", error.response?.data || error.message);
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

app.get(
	["/facebook", "/instagram", "/threads", "/whatsapp"],
	function (req, res) {
		if (
			req.query["hub.mode"] == "subscribe" &&
			req.query["hub.verify_token"] == token
		) {
			res.send(req.query["hub.challenge"]);
		} else {
			res.sendStatus(400);
		}
	}
);

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
						if (messagingEvent.message && messagingEvent.message.text && !messagingEvent.message.is_echo) {
							const senderId = messagingEvent.sender.id;
							const userMessage = messagingEvent.message.text;
							
							console.log(`Received message from ${senderId}: ${userMessage}`);
							
							// Get AI response
							const aiResponse = await getOpenAIResponse(userMessage);
							console.log(`AI Response: ${aiResponse}`);
							
							// Send reply to Instagram
							await sendInstagramMessage(senderId, aiResponse);
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

app.post("/whatsapp", function (req, res) {
	console.log("WhatsApp request body:");
	console.log(JSON.stringify(req.body, null, 2));
	// Process the WhatsApp updates here
	received_updates.unshift(req.body);
	res.sendStatus(200);
});

app.listen();
