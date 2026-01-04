const express = require("express");
const FAQ = require("../models/FAQ");
const UnansweredQuestion = require("../models/UnansweredQuestion");
const Business = require("../models/Business");
const auth = require("../middleware/auth");
const axios = require("axios");
const { findSimilarQuestions } = require("../utils/similarity");
const { ensureDBConnection } = require("../utils/db");

const router = express.Router();

// Get FAQ extraction status for authenticated user
router.get("/extraction-status", ensureDBConnection, auth, async (req, res) => {
	console.log("🔍 FAQ EXTRACTION STATUS CHECK ENDPOINT HIT!");
	console.log("User ID:", req.user.userId);

	try {
		const business = await Business.findOne({ user: req.user.userId });

		if (!business) {
			console.log("❌ Business not found for user:", req.user.userId);
			return res.status(404).json({
				message: "Business information not found.",
				status: null,
			});
		}

		const status = business.faqExtractionStatus || "idle";
		const updatedAt = business.faqExtractionUpdatedAt;
		const taskId = business.faqExtractionTaskId;

		console.log(`✅ Retrieved status "${status}" for user ${req.user.userId}`);

		res.json({
			status: status,
			updatedAt: updatedAt,
			taskId: taskId,
			message:
				status === "idle"
					? "No extraction in progress"
					: `Current status: ${status}`,
		});
	} catch (error) {
		console.error("Get FAQ extraction status error:", error);
		res.status(500).json({
			message: "Failed to retrieve FAQ extraction status.",
			error: error.message,
			status: null,
		});
	}
});

// ========== UNANSWERED QUESTIONS ENDPOINTS ==========

// Get all unanswered questions for the authenticated user
router.get("/unanswered", ensureDBConnection, auth, async (req, res) => {
	try {
		console.log("📋 Fetching unanswered questions for user:", req.user.userId);
		const { status } = req.query;

		const query = { userId: req.user.userId };
		if (status && ["pending", "resolved"].includes(status)) {
			query.status = status;
		}

		console.log("🔍 Query:", JSON.stringify(query));

		const unansweredQuestions = await UnansweredQuestion.find(query)
			.sort({ createdAt: -1 })
			.populate({
				path: "resolvedByFaqId",
				select: "question answer",
				options: { strictPopulate: false },
			})
			.lean();

		console.log(`✅ Found ${unansweredQuestions.length} unanswered questions`);

		res.json({
			unansweredQuestions,
			total: unansweredQuestions.length,
		});
	} catch (error) {
		console.error("❌ Get unanswered questions error:", error);
		console.error("Error stack:", error.stack);
		res.status(500).json({
			message: "Failed to fetch unanswered questions.",
			error: error.message,
		});
	}
});

// Manually resolve an unanswered question
router.put(
	"/unanswered/:id/resolve",
	ensureDBConnection,
	auth,
	async (req, res) => {
		try {
			const unansweredQuestion = await UnansweredQuestion.findOneAndUpdate(
				{
					_id: req.params.id,
					userId: req.user.userId,
				},
				{
					$set: {
						status: "resolved",
						resolvedAt: new Date(),
					},
				},
				{ new: true }
			);

			if (!unansweredQuestion) {
				return res
					.status(404)
					.json({ message: "Unanswered question not found." });
			}

			res.json({
				message: "Question marked as resolved.",
				unansweredQuestion,
			});
		} catch (error) {
			console.error("Resolve unanswered question error:", error);
			res.status(500).json({
				message: "Failed to resolve question.",
			});
		}
	}
);

// Mark an unanswered question as pending
router.put(
	"/unanswered/:id/unresolve",
	ensureDBConnection,
	auth,
	async (req, res) => {
		try {
			const unansweredQuestion = await UnansweredQuestion.findOneAndUpdate(
				{
					_id: req.params.id,
					userId: req.user.userId,
				},
				{
					$set: {
						status: "pending",
						resolvedAt: null,
						resolvedByFaqId: null,
					},
				},
				{ new: true }
			);

			if (!unansweredQuestion) {
				return res
					.status(404)
					.json({ message: "Unanswered question not found." });
			}

			res.json({
				message: "Question marked as pending.",
				unansweredQuestion,
			});
		} catch (error) {
			console.error("Unresolve unanswered question error:", error);
			res.status(500).json({
				message: "Failed to mark question as pending.",
			});
		}
	}
);
// Delete an unanswered question
router.delete(
	"/unanswered/:id",
	ensureDBConnection,
	auth,
	async (req, res) => {
		try {
			const unansweredQuestion = await UnansweredQuestion.findOneAndDelete({
				_id: req.params.id,
				userId: req.user.userId,
			});

			if (!unansweredQuestion) {
				return res
					.status(404)
					.json({ message: "Unanswered question not found." });
			}

			res.json({
				message: "Question deleted successfully.",
			});
		} catch (error) {
			console.error("Delete unanswered question error:", error);
			res.status(500).json({
				message: "Failed to delete question.",
			});
		}
	}
);
// Convert an unanswered question to FAQ
router.post(
	"/unanswered/:id/convert",
	ensureDBConnection,
	auth,
	async (req, res) => {
		try {
			const { answer } = req.body;

			if (!answer) {
				return res.status(400).json({
					message: "Answer is required to convert to FAQ.",
				});
			}

			// Find the unanswered question
			const unansweredQuestion = await UnansweredQuestion.findOne({
				_id: req.params.id,
				userId: req.user.userId,
			});

			if (!unansweredQuestion) {
				return res
					.status(404)
					.json({ message: "Unanswered question not found." });
			}

			// Create FAQ from unanswered question
			const faq = new FAQ({
				question: unansweredQuestion.question.trim(),
				answer: answer.trim(),
				user: req.user.userId,
			});

			await faq.save();

			// Auto-resolve similar unanswered questions
			let autoResolvedCount = 0;
			try {
				const pendingQuestions = await UnansweredQuestion.find({
					userId: req.user.userId,
					status: "pending",
				}).lean();

				if (pendingQuestions.length > 0) {
					const similarQuestions = findSimilarQuestions(
						unansweredQuestion.question.trim(),
						pendingQuestions,
						0.65
					);

					if (similarQuestions.length > 0) {
						const questionIds = similarQuestions.map((q) => q._id);
						const updateResult = await UnansweredQuestion.updateMany(
							{ _id: { $in: questionIds } },
							{
								$set: {
									status: "resolved",
									resolvedAt: new Date(),
									resolvedByFaqId: faq._id,
								},
							}
						);

						autoResolvedCount = updateResult.modifiedCount || 0;
						console.log(
							`✅ Auto-resolved ${autoResolvedCount} similar unanswered questions`
						);
					}
				}
			} catch (autoResolveError) {
				console.error("❌ Error in auto-resolution:", autoResolveError);
			}

			res.status(201).json({
				message: "FAQ created successfully from unanswered question.",
				faq,
				autoResolvedCount,
			});
		} catch (error) {
			console.error("Convert unanswered to FAQ error:", error);
			res.status(500).json({
				message: "Failed to convert question to FAQ.",
			});
		}
	}
);

// ========== FAQ ENDPOINTS ==========

// Get all FAQs for the authenticated user
router.get("/", ensureDBConnection, auth, async (req, res) => {
	try {
		const faqs = await FAQ.find({ user: req.user.userId }).sort({
			createdAt: -1,
		});

		res.json({
			faqs,
			total: faqs.length,
		});
	} catch (error) {
		console.error("Get FAQs error:", error);
		res.status(500).json({
			message: "Failed to fetch FAQs.",
		});
	}
});

// Get a specific FAQ
router.get("/:id", ensureDBConnection, auth, async (req, res) => {
	try {
		const faq = await FAQ.findOne({
			_id: req.params.id,
			user: req.user.userId,
		});

		if (!faq) {
			return res.status(404).json({ message: "FAQ not found." });
		}

		res.json({ faq });
	} catch (error) {
		console.error("Get FAQ error:", error);
		res.status(500).json({
			message: "Failed to fetch FAQ.",
		});
	}
});

// Create a new FAQ
router.post("/", ensureDBConnection, auth, async (req, res) => {
	try {
		const { question, answer } = req.body;

		if (!question || !answer) {
			return res.status(400).json({
				message: "Question and answer are required.",
			});
		}

		const faq = new FAQ({
			question: question.trim(),
			answer: answer.trim(),
			user: req.user.userId,
		});

		await faq.save();

		// Auto-resolve similar unanswered questions
		let autoResolvedCount = 0;
		try {
			// Get all pending unanswered questions for this user
			const pendingQuestions = await UnansweredQuestion.find({
				userId: req.user.userId,
				status: "pending",
			}).lean();

			if (pendingQuestions.length > 0) {
				// Find similar questions using similarity matching
				const similarQuestions = findSimilarQuestions(
					question.trim(),
					pendingQuestions,
					0.65 // 65% similarity threshold
				);

				if (similarQuestions.length > 0) {
					// Bulk update all similar questions to resolved
					const questionIds = similarQuestions.map((q) => q._id);
					const updateResult = await UnansweredQuestion.updateMany(
						{ _id: { $in: questionIds } },
						{
							$set: {
								status: "resolved",
								resolvedAt: new Date(),
								resolvedByFaqId: faq._id,
							},
						}
					);

					autoResolvedCount = updateResult.modifiedCount || 0;
					console.log(
						`✅ Auto-resolved ${autoResolvedCount} similar unanswered questions`
					);
				}
			}
		} catch (autoResolveError) {
			console.error("❌ Error in auto-resolution:", autoResolveError);
			// Don't fail the FAQ creation if auto-resolution fails
		}

		res.status(201).json({
			message: "FAQ created successfully.",
			faq,
			autoResolvedCount,
		});
	} catch (error) {
		console.error("Create FAQ error:", error);
		res.status(500).json({
			message: "Failed to create FAQ.",
		});
	}
});

// Update a specific FAQ
router.put("/:id", ensureDBConnection, auth, async (req, res) => {
	try {
		const { question, answer } = req.body;

		if (!question || !answer) {
			return res.status(400).json({
				message: "Question and answer are required.",
			});
		}

		const faq = await FAQ.findOneAndUpdate(
			{
				_id: req.params.id,
				user: req.user.userId,
			},
			{
				question: question.trim(),
				answer: answer.trim(),
			},
			{ new: true }
		);

		if (!faq) {
			return res.status(404).json({ message: "FAQ not found." });
		}

		res.json({
			message: "FAQ updated successfully.",
			faq,
		});
	} catch (error) {
		console.error("Update FAQ error:", error);
		res.status(500).json({
			message: "Failed to update FAQ.",
		});
	}
});

// Delete a specific FAQ
router.delete("/:id", ensureDBConnection, auth, async (req, res) => {
	try {
		const faq = await FAQ.findOneAndDelete({
			_id: req.params.id,
			user: req.user.userId,
		});

		if (!faq) {
			return res.status(404).json({ message: "FAQ not found." });
		}

		res.json({
			message: "FAQ deleted successfully.",
		});
	} catch (error) {
		console.error("Delete FAQ error:", error);
		res.status(500).json({
			message: "Failed to delete FAQ.",
		});
	}
});

// Extract FAQs from user's website
router.post("/extract", ensureDBConnection, auth, async (req, res) => {
	try {
		// Check if user has business information with website
		const business = await Business.findOne({ user: req.user.userId });

		if (!business || !business.website) {
			return res.status(400).json({
				message:
					"Please add your business website in your business information before extracting FAQs.",
			});
		}

		// Send request to FAQ extraction service with userid
		const faqScraperUrl =
			process.env.FAQ_SCRAPER_URL ||
			process.env.FAQ_SCRAPER_URL_LOCAL ||
			"http://localhost:5001";
		const response = await axios.post(`${faqScraperUrl}/extract_faqs`, {
			url: business.website,
			userid: req.user.userId,
			max_pages: 10,
			max_depth: 3,
		});

		// Check if response contains "okay" status
		if (
			response.data &&
			(response.data.status === "okay" ||
				response.data.toLowerCase() === "okay")
		) {
			res.json({
				message: "Your FAQs will be added automatically in 5 to 10 minutes.",
			});
		} else {
			res.status(500).json({
				message: "Failed to initiate FAQ extraction. Please try again later.",
			});
		}
	} catch (error) {
		console.error("Extract FAQ error:", error);
		if (error.code === "ECONNREFUSED") {
			res.status(503).json({
				message:
					"FAQ extraction service is currently unavailable. Please try again later.",
			});
		} else {
			res.status(500).json({
				message: "Failed to extract FAQs from your website.",
			});
		}
	}
});

// Debug endpoint to test 5001 service connection
router.post("/test-push", (req, res) => {
	console.log("🧪 TEST ENDPOINT HIT!");
	console.log("Request body:", req.body);
	console.log("Headers:", req.headers);
	res.json({
		message: "Test endpoint working!",
		receivedData: req.body,
		timestamp: new Date().toISOString(),
	});
});

// Push extracted FAQs to database (for FAQ extraction service)
router.post("/push-extracted", ensureDBConnection, async (req, res) => {
	console.log("📤 PUSH EXTRACTED ENDPOINT HIT!");
	console.log("Request body keys:", Object.keys(req.body));
	console.log("Request headers:", req.headers);

	try {
		const { userId, faqs } = req.body;

		if (!userId || !faqs || !Array.isArray(faqs)) {
			console.log("❌ Missing required fields:", {
				userId: !!userId,
				faqs: !!faqs,
				isArray: Array.isArray(faqs),
			});
			return res.status(400).json({
				message: "userId and faqs array are required.",
				received: { userId, faqs, faqsType: typeof faqs },
			});
		}

		console.log(`✅ Processing ${faqs.length} FAQs for user ${userId}`);

		const savedFaqs = [];
		const errors = [];

		// Process each FAQ
		for (const faqData of faqs) {
			try {
				const { question, answer } = faqData;

				if (!question || !answer) {
					errors.push({
						faq: faqData,
						error: "Question and answer are required.",
					});
					continue;
				}

				const faq = new FAQ({
					question: question.trim(),
					answer: answer.trim(),
					user: userId,
				});

				await faq.save();
				savedFaqs.push(faq);
			} catch (error) {
				console.error("Error saving individual FAQ:", error);
				errors.push({
					faq: faqData,
					error: error.message,
				});
			}
		}

		console.log(
			`✅ Successfully saved ${savedFaqs.length} FAQs, ${errors.length} errors`
		);

		res.json({
			message: `Successfully processed ${savedFaqs.length} FAQs.`,
			savedCount: savedFaqs.length,
			errorCount: errors.length,
			savedFaqs: savedFaqs,
			errors: errors,
		});
	} catch (error) {
		console.error("Push extracted FAQs error:", error);
		res.status(500).json({
			message: "Failed to process extracted FAQs.",
			error: error.message,
		});
	}
});

// Update FAQ extraction status
router.post("/update-status", ensureDBConnection, async (req, res) => {
	console.log("🔄 FAQ EXTRACTION STATUS UPDATE ENDPOINT HIT!");
	console.log("Request body:", req.body);

	try {
		const { userId, status, taskId } = req.body;

		if (!userId || !status) {
			console.log("❌ Missing required fields:", {
				userId: !!userId,
				status: !!status,
			});
			return res.status(400).json({
				message: "userId and status are required.",
				received: { userId, status },
			});
		}

		// Validate status values
		const validStatuses = ["ongoing", "completed", "failed", "stopped"];
		if (!validStatuses.includes(status)) {
			console.log("❌ Invalid status:", status);
			return res.status(400).json({
				message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
				received: { status },
			});
		}

		// Update business record with FAQ extraction status
		const business = await Business.findOneAndUpdate(
			{ user: userId },
			{
				$set: {
					faqExtractionStatus: status,
					faqExtractionUpdatedAt: new Date(),
					...(taskId && { faqExtractionTaskId: taskId }),
				},
			},
			{ new: true }
		);

		if (!business) {
			console.log("❌ Business not found for user:", userId);
			return res.status(404).json({
				message: "Business not found for the provided user.",
			});
		}

		console.log(
			`✅ Successfully updated FAQ extraction status to "${status}" for user ${userId}`
		);

		res.json({
			message: "FAQ extraction status updated successfully.",
			status: status,
			updatedAt: business.faqExtractionUpdatedAt,
		});
	} catch (error) {
		console.error("Update FAQ extraction status error:", error);
		res.status(500).json({
			message: "Failed to update FAQ extraction status.",
			error: error.message,
		});
	}
});

module.exports = router;
