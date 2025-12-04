const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const conversationSchema = new mongoose.Schema({
  senderId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  platform: {
    type: String,
    enum: ['instagram', 'whatsapp'],
    required: true
  },
  messages: [messageSchema],
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
conversationSchema.index({ senderId: 1, platform: 1 });

// Method to add a message
conversationSchema.methods.addMessage = function(role, content) {
  this.messages.push({ role, content });
  this.lastMessageAt = new Date();
  return this.save();
};

// Method to get recent messages (for context)
conversationSchema.methods.getRecentMessages = function(limit = 10) {
  return this.messages.slice(-limit);
};

// Static method to find or create conversation
conversationSchema.statics.findOrCreate = async function(senderId, platform, userId = null) {
  let conversation = await this.findOne({ senderId, platform, isActive: true });
  
  if (!conversation) {
    conversation = await this.create({
      senderId,
      platform,
      userId
    });
  } else if (userId && !conversation.userId) {
    // Update userId if it wasn't set before
    conversation.userId = userId;
    await conversation.save();
  }
  
  return conversation;
};

// Auto-archive old conversations after 7 days of inactivity
conversationSchema.statics.archiveOldConversations = async function() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  await this.updateMany(
    { 
      lastMessageAt: { $lt: sevenDaysAgo },
      isActive: true 
    },
    { 
      isActive: false 
    }
  );
};

module.exports = mongoose.model('Conversation', conversationSchema);
