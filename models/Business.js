const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  businessName: {
    type: String,
    required: true,
    trim: true
  },
  businessCategory: {
    type: String,
    required: true,
    enum: ['consulting', 'technology', 'retail', 'healthcare', 'finance', 'manufacturing'],
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  website: {
    type: String,
    trim: true
  },
  businessDescription: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  // FAQ extraction status tracking
  faqExtractionStatus: {
    type: String,
    enum: ['idle', 'ongoing', 'completed', 'failed', 'stopped'],
    default: 'idle'
  },
  faqExtractionUpdatedAt: {
    type: Date
  },
  faqExtractionTaskId: {
    type: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Business', businessSchema);