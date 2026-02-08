const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  duration: {
    type: Number,
    required: true,
    min: 15,
    max: 480,
    validate: {
      validator: Number.isInteger,
      message: 'Duration must be an integer (minutes)'
    }
  },
  price: {
    type: Number,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD',
    trim: true,
    uppercase: true
  },
  category: {
    type: String,
    trim: true
  },
  staffMembers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StaffMember'
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  color: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^#[0-9A-F]{6}$/i.test(v);
      },
      message: 'Color must be a valid hex color code (e.g., #4F46E5)'
    }
  },
  maxBookingsPerSlot: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  }
}, {
  timestamps: true
});

// Compound index for unique service per business
serviceSchema.index({ business: 1, name: 1 }, { unique: true });

// Static method to get active services with staff for a business
serviceSchema.statics.getActiveServicesWithStaff = function(businessId) {
  return this.find({ 
    business: businessId, 
    isActive: true 
  }).populate({
    path: 'staffMembers',
    match: { isActive: true },
    select: 'name email role googleCalendarIntegrationStatus'
  }).sort({ name: 1 });
};

module.exports = mongoose.model('Service', serviceSchema);
