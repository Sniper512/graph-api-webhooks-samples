const mongoose = require('mongoose');

const timeSlotSchema = new mongoose.Schema({
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    index: true
  },
  // Day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  dayOfWeek: {
    type: Number,
    required: true,
    min: 0,
    max: 6,
    validate: {
      validator: Number.isInteger,
      message: 'Day of week must be an integer between 0 and 6'
    }
  },
  // Time slots for this day
  slots: [{
    startTime: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          // Validate time format (HH:MM 24-hour format)
          return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'Start time must be in HH:MM format (24-hour)'
      }
    },
    endTime: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          // Validate time format (HH:MM 24-hour format)
          return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'End time must be in HH:MM format (24-hour)'
      }
    },
    duration: {
      type: Number,
      required: true,
      min: 15,
      max: 480, // 8 hours max
      validate: {
        validator: Number.isInteger,
        message: 'Duration must be an integer'
      }
    },
    slotName: {
      type: String,
      trim: true,
      maxlength: 100
    },
    maxBookings: {
      type: Number,
      default: 1,
      min: 1,
      max: 10
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  // Specific date overrides (for holidays, special events, etc.)
  dateOverrides: [{
    date: {
      type: Date,
      required: true
    },
    isAvailable: {
      type: Boolean,
      required: true
    },
    customSlots: [{
      startTime: {
        type: String,
        required: true,
        validate: {
          validator: function(v) {
            return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
          },
          message: 'Start time must be in HH:MM format (24-hour)'
        }
      },
      endTime: {
        type: String,
        required: true,
        validate: {
          validator: function(v) {
            return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
          },
          message: 'End time must be in HH:MM format (24-hour)'
        }
      },
      duration: {
        type: Number,
        required: true,
        min: 15,
        max: 480
      },
      slotName: {
        type: String,
        trim: true,
        maxlength: 100
      },
      maxBookings: {
        type: Number,
        default: 1,
        min: 1,
        max: 10
      }
    }],
    reason: {
      type: String,
      trim: true,
      maxlength: 200
    }
  }],
  // Business settings for this time slot configuration
  settings: {
    bufferTime: {
      type: Number,
      default: 0, // minutes between bookings
      min: 0,
      max: 60
    },
    advanceBookingDays: {
      type: Number,
      default: 30, // how many days in advance users can book
      min: 1,
      max: 365
    },
    sameDayBooking: {
      type: Boolean,
      default: false
    },
    bookingNotifications: {
      type: Boolean,
      default: true
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
timeSlotSchema.index({ business: 1, dayOfWeek: 1 });
timeSlotSchema.index({ business: 1, 'dateOverrides.date': 1 });

// Validate that end time is after start time
timeSlotSchema.pre('validate', function(next) {
  for (let slot of this.slots) {
    const start = slot.startTime.split(':').map(Number);
    const end = slot.endTime.split(':').map(Number);
    
    const startMinutes = start[0] * 60 + start[1];
    const endMinutes = end[0] * 60 + end[1];
    
    if (endMinutes <= startMinutes) {
      return next(new Error(`End time must be after start time for slot: ${slot.startTime} - ${slot.endTime}`));
    }
  }
  next();
});

// Method to check if a specific date/time is available
timeSlotSchema.methods.isTimeSlotAvailable = function(date, startTime, endTime) {
  const dayOfWeek = date.getDay();
  const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD format
  
  // Check for date overrides first
  for (let override of this.dateOverrides) {
    if (override.date.toISOString().split('T')[0] === dateString) {
      if (!override.isAvailable) {
        return false; // Date is blocked
      }
      // Check custom slots for this date
      if (override.customSlots && override.customSlots.length > 0) {
        return this.checkTimeAgainstSlots(startTime, endTime, override.customSlots);
      }
      break; // No custom slots, use regular schedule
    }
  }
  
  // Check regular schedule for this day of week
  if (dayOfWeek !== this.dayOfWeek) {
    return false;
  }
  
  return this.checkTimeAgainstSlots(startTime, endTime, this.slots);
};

// Helper method to check time against slot list
timeSlotSchema.methods.checkTimeAgainstSlots = function(startTime, endTime, slots) {
  const requestStart = this.timeToMinutes(startTime);
  const requestEnd = this.timeToMinutes(endTime);
  
  for (let slot of slots) {
    if (!slot.isActive) continue;
    
    const slotStart = this.timeToMinutes(slot.startTime);
    const slotEnd = this.timeToMinutes(slot.endTime);
    
    // Check if requested time falls within this slot
    if (requestStart >= slotStart && requestEnd <= slotEnd) {
      return true;
    }
  }
  
  return false;
};

// Helper method to convert time string to minutes
timeSlotSchema.methods.timeToMinutes = function(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
};

// Static method to get weekly availability
timeSlotSchema.statics.getWeeklyAvailability = function(businessId) {
  return this.find({ 
    business: businessId, 
    isActive: true 
  }).sort({ dayOfWeek: 1 });
};

// Static method to get availability for specific date range
timeSlotSchema.statics.getAvailabilityForDateRange = function(businessId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        business: new mongoose.Types.ObjectId(businessId),
        isActive: true
      }
    },
    {
      $project: {
        dayOfWeek: 1,
        slots: 1,
        dateOverrides: 1,
        settings: 1
      }
    }
  ]);
};

module.exports = mongoose.model('TimeSlot', timeSlotSchema);