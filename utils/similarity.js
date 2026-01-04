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

module.exports = {
	findSimilarQuestions,
};
