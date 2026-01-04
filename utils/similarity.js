const stringSimilarity = require("string-similarity");
const axios = require("axios");

/**
 * Find questions similar to the given question from a list of candidates
 * @param {string} newQuestion - The new question to match against
 * @param {Array} candidateQuestions - Array of objects with 'question' property and '_id'
 * @param {number} threshold - Similarity threshold (0-1), default 0.65
 * @returns {Array} Array of matched objects with similarity scores
 */
function findSimilarQuestions(
	newQuestion,
	candidateQuestions,
	threshold = 0.65
) {
	if (!newQuestion || !candidateQuestions || candidateQuestions.length === 0) {
		return [];
	}

	const matches = [];

	// Normalize the new question
	const normalizedNew = newQuestion.toLowerCase().trim();

	for (const candidate of candidateQuestions) {
		if (!candidate.question) continue;

		const normalizedCandidate = candidate.question.toLowerCase().trim();

		// Calculate similarity score
		const similarity = stringSimilarity.compareTwoStrings(
			normalizedNew,
			normalizedCandidate
		);

		// If similarity exceeds threshold, add to matches
		if (similarity >= threshold) {
			matches.push({
				...candidate,
				similarityScore: similarity,
			});
		}
	}

	// Sort by similarity score (highest first)
	matches.sort((a, b) => b.similarityScore - a.similarityScore);

	return matches;
}

/**
 * Use AI to check if a bot response indicates a failure to answer or refusal
 * @param {string} userQuestion - The original user question
 * @param {string} botResponse - The bot's response text
 * @returns {Promise<boolean>} True if response indicates failure, refusal, or out-of-scope
 */
async function isFailedResponse(userQuestion, botResponse) {
	if (!botResponse) return false;

	try {
		const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
		if (!OPENAI_API_KEY) {
			console.warn(
				"⚠️ OpenAI API key not found, skipping failed response detection"
			);
			return false;
		}

		const response = await axios.post(
			"https://api.openai.com/v1/chat/completions",
			{
				model: "gpt-4o-mini", // Use cheaper, faster model for classification
				messages: [
					{
						role: "system",
						content: `You are a classifier that determines if a chatbot response indicates it DECLINED, REFUSED, or was UNABLE to answer a user's question.

Return "YES" if the response:
- Redirects the user to only talk about business-related topics
- Politely refuses to answer because the question is out of scope
- Says it doesn't have the information
- Apologizes for being unable to help
- Says it can only help with specific business topics
- Redirects away from the user's actual question

Return "NO" if the response:
- Actually attempts to answer the question
- Provides relevant information
- Engages with the user's question meaningfully

Respond with ONLY "YES" or "NO".`,
					},
					{
						role: "user",
						content: `User Question: "${userQuestion}"\n\nBot Response: "${botResponse}"\n\nDid the bot decline or refuse to answer? (YES/NO)`,
					},
				],
				max_tokens: 5,
				temperature: 0,
			},
			{
				headers: {
					Authorization: `Bearer ${OPENAI_API_KEY}`,
					"Content-Type": "application/json",
				},
			}
		);

		const result = response.data.choices[0]?.message?.content
			?.trim()
			.toUpperCase();
		const isRefusal = result === "YES";

		if (isRefusal) {
			console.log(`🔍 AI detected unanswered question: "${userQuestion}"`);
		}

		return isRefusal;
	} catch (error) {
		console.error(
			"❌ Error in AI-based failed response detection:",
			error.message
		);
		// Fall back to simple pattern matching as safety net
		const basicPatterns = [
			/don't have.*information/i,
			/having trouble processing/i,
			/please try again later/i,
			/error/i,
		];
		return basicPatterns.some((pattern) => pattern.test(botResponse));
	}
}

module.exports = {
	findSimilarQuestions,
	isFailedResponse,
};
