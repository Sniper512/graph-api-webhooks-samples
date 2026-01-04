const stringSimilarity = require("string-similarity");

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
 * Check if a bot response indicates a failure to answer
 * @param {string} response - The bot's response text
 * @returns {boolean} True if response indicates failure
 */
function isFailedResponse(response) {
	if (!response) return false;

	const failurePatterns = [
		/sorry.*don't.*provide.*service/i,
		/don't have.*information/i,
		/not sure how to respond/i,
		/having trouble processing/i,
		/please try again later/i,
		/sorry.*can't/i,
		/i apologize.*unable/i,
		/i'm here to help with.*related to/i, // Detects out-of-scope redirects
		/politely refuse/i,
		/not related to (our |the )?business/i,
		/can't (help|assist) with that/i,
		/outside (of )?(my|our) scope/i,
		/team member will connect with you/i, // When bot lacks specific info
		/one of our team.*will.*shortly/i,
	];

	return failurePatterns.some((pattern) => pattern.test(response));
}

module.exports = {
	findSimilarQuestions,
	isFailedResponse,
};
