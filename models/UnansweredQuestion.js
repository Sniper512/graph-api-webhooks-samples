const mongoose = require('mongoose');

const unansweredQuestionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    question: {
        type: String,
        required: true,
        trim: true
    },
    botResponse: {
        type: String,
        required: true,
        trim: true
    },
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'resolved'],
        default: 'pending',
        index: true
    },
    resolvedAt: {
        type: Date,
        default: null
    },
    resolvedByFaqId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FAQ',
        default: null
    }
}, {
    timestamps: true
});

// Compound index for efficient queries
unansweredQuestionSchema.index({ userId: 1, status: 1 });
unansweredQuestionSchema.index({ createdAt: -1 });

const UnansweredQuestion = mongoose.model('UnansweredQuestion', unansweredQuestionSchema);

module.exports = UnansweredQuestion;
