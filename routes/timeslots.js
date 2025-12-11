const express = require('express');
const TimeSlot = require('../models/TimeSlot');
const Business = require('../models/Business');
const auth = require('../middleware/auth');

const router = express.Router();

// Day names mapping for better readability
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Helper function to validate day of week
const validateDayOfWeek = (day) => {
  return Number.isInteger(day) && day >= 0 && day <= 6;
};

// Helper function to validate time format
const validateTimeFormat = (time) => {
  return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
};

// Helper function to validate slot data
const validateSlotData = (slots) => {
  if (!Array.isArray(slots)) {
    return 'Slots must be an array';
  }
  
  for (let slot of slots) {
    if (!slot.startTime || !validateTimeFormat(slot.startTime)) {
      return `Invalid start time: ${slot.startTime}`;
    }
    if (!slot.endTime || !validateTimeFormat(slot.endTime)) {
      return `Invalid end time: ${slot.endTime}`;
    }
    if (!slot.duration || slot.duration < 15 || slot.duration > 480) {
      return `Invalid duration: ${slot.duration}. Must be between 15 and 480 minutes`;
    }
    if (slot.maxBookings && (slot.maxBookings < 1 || slot.maxBookings > 10)) {
      return `Invalid maxBookings: ${slot.maxBookings}. Must be between 1 and 10`;
    }
  }
  
  return null;
};

// Create or update time slots for a specific day
router.post('/:dayOfWeek', auth, async (req, res) => {
  console.log('\n🕐 TIMESLOT POST ROUTE HIT');
  console.log('📅 Day of week:', req.params.dayOfWeek);
  console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
  console.log('👤 User ID from token:', req.user.userId);
  
  try {
    const { dayOfWeek } = req.params;
    const { slots, settings, isActive } = req.body;
    
    // Validate day of week
    const day = parseInt(dayOfWeek);
    if (!validateDayOfWeek(day)) {
      return res.status(400).json({
        message: 'Invalid day of week. Must be 0-6 (0=Sunday, 6=Saturday)'
      });
    }
    
    // Check if business exists
    const business = await Business.findOne({ user: req.user.userId });
    if (!business) {
      return res.status(404).json({
        message: 'Business information not found. Please create business information first.'
      });
    }
    
    // Validate slots data
    const slotsError = validateSlotData(slots);
    if (slotsError) {
      return res.status(400).json({
        message: slotsError
      });
    }
    
    // Find existing time slot for this day
    let timeSlot = await TimeSlot.findOne({ 
      business: business._id, 
      dayOfWeek: day 
    });
    
    if (timeSlot) {
      // Update existing time slot
      timeSlot.slots = slots;
      if (settings) {
        timeSlot.settings = { ...timeSlot.settings, ...settings };
      }
      if (typeof isActive === 'boolean') {
        timeSlot.isActive = isActive;
      }
      
      await timeSlot.save();
      
      res.json({
        message: `Time slots for ${DAY_NAMES[day]} updated successfully.`,
        timeSlot: {
          id: timeSlot._id,
          dayOfWeek: timeSlot.dayOfWeek,
          dayName: DAY_NAMES[timeSlot.dayOfWeek],
          slots: timeSlot.slots,
          settings: timeSlot.settings,
          isActive: timeSlot.isActive,
          createdAt: timeSlot.createdAt,
          updatedAt: timeSlot.updatedAt
        }
      });
    } else {
      // Create new time slot
      timeSlot = new TimeSlot({
        business: business._id,
        dayOfWeek: day,
        slots: slots,
        settings: settings || {},
        isActive: isActive !== false // Default to true
      });
      
      await timeSlot.save();
      
      res.status(201).json({
        message: `Time slots for ${DAY_NAMES[day]} created successfully.`,
        timeSlot: {
          id: timeSlot._id,
          dayOfWeek: timeSlot.dayOfWeek,
          dayName: DAY_NAMES[timeSlot.dayOfWeek],
          slots: timeSlot.slots,
          settings: timeSlot.settings,
          isActive: timeSlot.isActive,
          createdAt: timeSlot.createdAt,
          updatedAt: timeSlot.updatedAt
        }
      });
    }
    
  } catch (error) {
    console.error('Create/update time slots error:', error);
    res.status(500).json({
      message: 'Internal server error during time slot operation.'
    });
  }
});

// Get time slots for a specific day
router.get('/:dayOfWeek', auth, async (req, res) => {
  console.log('\n🕐 TIMESLOT GET ROUTE HIT');
  console.log('📅 Day of week:', req.params.dayOfWeek);
  console.log('👤 User ID from token:', req.user.userId);
  
  try {
    const { dayOfWeek } = req.params;
    const day = parseInt(dayOfWeek);
    
    if (!validateDayOfWeek(day)) {
      return res.status(400).json({
        message: 'Invalid day of week. Must be 0-6 (0=Sunday, 6=Saturday)'
      });
    }
    
    const business = await Business.findOne({ user: req.user.userId });
    if (!business) {
      return res.status(404).json({
        message: 'Business information not found.'
      });
    }
    
    const timeSlot = await TimeSlot.findOne({ 
      business: business._id, 
      dayOfWeek: day 
    });
    
    if (!timeSlot) {
      return res.status(404).json({
        message: `No time slots found for ${DAY_NAMES[day]}.`,
        timeSlot: null
      });
    }
    
    res.json({
      timeSlot: {
        id: timeSlot._id,
        dayOfWeek: timeSlot.dayOfWeek,
        dayName: DAY_NAMES[timeSlot.dayOfWeek],
        slots: timeSlot.slots,
        settings: timeSlot.settings,
        isActive: timeSlot.isActive,
        createdAt: timeSlot.createdAt,
        updatedAt: timeSlot.updatedAt
      }
    });
    
  } catch (error) {
    console.error('Get time slots error:', error);
    res.status(500).json({
      message: 'Internal server error.'
    });
  }
});

// Get all time slots for the week
router.get('/', auth, async (req, res) => {
  try {
    const business = await Business.findOne({ user: req.user.userId });
    if (!business) {
      return res.status(404).json({
        message: 'Business information not found.'
      });
    }
    
    const timeSlots = await TimeSlot.find({ 
      business: business._id 
    }).sort({ dayOfWeek: 1 });
    
    const formattedTimeSlots = timeSlots.map(timeSlot => ({
      id: timeSlot._id,
      dayOfWeek: timeSlot.dayOfWeek,
      dayName: DAY_NAMES[timeSlot.dayOfWeek],
      slots: timeSlot.slots,
      settings: timeSlot.settings,
      isActive: timeSlot.isActive,
      createdAt: timeSlot.createdAt,
      updatedAt: timeSlot.updatedAt
    }));
    
    res.json({
      timeSlots: formattedTimeSlots,
      totalDays: timeSlots.length
    });
    
  } catch (error) {
    console.error('Get weekly time slots error:', error);
    res.status(500).json({
      message: 'Internal server error.'
    });
  }
});

// Delete time slots for a specific day
router.delete('/:dayOfWeek', auth, async (req, res) => {
  try {
    const { dayOfWeek } = req.params;
    const day = parseInt(dayOfWeek);
    
    if (!validateDayOfWeek(day)) {
      return res.status(400).json({
        message: 'Invalid day of week. Must be 0-6 (0=Sunday, 6=Saturday)'
      });
    }
    
    const business = await Business.findOne({ user: req.user.userId });
    if (!business) {
      return res.status(404).json({
        message: 'Business information not found.'
      });
    }
    
    const timeSlot = await TimeSlot.findOneAndDelete({ 
      business: business._id, 
      dayOfWeek: day 
    });
    
    if (!timeSlot) {
      return res.status(404).json({
        message: `No time slots found for ${DAY_NAMES[day]} to delete.`
      });
    }
    
    res.json({
      message: `Time slots for ${DAY_NAMES[day]} deleted successfully.`
    });
    
  } catch (error) {
    console.error('Delete time slots error:', error);
    res.status(500).json({
      message: 'Internal server error during time slot deletion.'
    });
  }
});

// Check availability for a specific date and time
router.post('/check-availability', auth, async (req, res) => {
  try {
    const { date, startTime, endTime } = req.body;
    
    if (!date || !startTime || !endTime) {
      return res.status(400).json({
        message: 'Date, startTime, and endTime are required.'
      });
    }
    
    if (!validateTimeFormat(startTime) || !validateTimeFormat(endTime)) {
      return res.status(400).json({
        message: 'Start time and end time must be in HH:MM format (24-hour).'
      });
    }
    
    const business = await Business.findOne({ user: req.user.userId });
    if (!business) {
      return res.status(404).json({
        message: 'Business information not found.'
      });
    }
    
    const requestDate = new Date(date);
    if (isNaN(requestDate.getTime())) {
      return res.status(400).json({
        message: 'Invalid date format. Use YYYY-MM-DD format.'
      });
    }
    
    // Check all time slots for this business
    const timeSlots = await TimeSlot.find({ 
      business: business._id, 
      isActive: true 
    });
    
    let isAvailable = false;
    let matchingDay = null;
    
    for (let timeSlot of timeSlots) {
      if (timeSlot.isTimeSlotAvailable(requestDate, startTime, endTime)) {
        isAvailable = true;
        matchingDay = DAY_NAMES[timeSlot.dayOfWeek];
        break;
      }
    }
    
    res.json({
      isAvailable,
      date: requestDate.toISOString().split('T')[0],
      requestedTime: `${startTime} - ${endTime}`,
      matchingDay: matchingDay,
      message: isAvailable 
        ? 'Time slot is available for booking.'
        : 'Time slot is not available for the requested date and time.'
    });
    
  } catch (error) {
    console.error('Check availability error:', error);
    res.status(500).json({
      message: 'Internal server error during availability check.'
    });
  }
});

// Add date override (for holidays, special events, etc.)
router.post('/date-override', auth, async (req, res) => {
  try {
    const { date, isAvailable, customSlots, reason } = req.body;
    
    if (!date) {
      return res.status(400).json({
        message: 'Date is required.'
      });
    }
    
    if (typeof isAvailable !== 'boolean') {
      return res.status(400).json({
        message: 'isAvailable must be a boolean value.'
      });
    }
    
    if (!isAvailable && customSlots) {
      return res.status(400).json({
        message: 'Custom slots are only allowed when isAvailable is true.'
      });
    }
    
    if (customSlots) {
      const slotsError = validateSlotData(customSlots);
      if (slotsError) {
        return res.status(400).json({
          message: slotsError
        });
      }
    }
    
    const business = await Business.findOne({ user: req.user.userId });
    if (!business) {
      return res.status(404).json({
        message: 'Business information not found.'
      });
    }
    
    const overrideDate = new Date(date);
    if (isNaN(overrideDate.getTime())) {
      return res.status(400).json({
        message: 'Invalid date format. Use YYYY-MM-DD format.'
      });
    }
    
    // Find or create time slot for the day of week
    const dayOfWeek = overrideDate.getDay();
    let timeSlot = await TimeSlot.findOne({ 
      business: business._id, 
      dayOfWeek: dayOfWeek 
    });
    
    if (!timeSlot) {
      // Create a new time slot document for this day if it doesn't exist
      timeSlot = new TimeSlot({
        business: business._id,
        dayOfWeek: dayOfWeek,
        slots: [],
        dateOverrides: []
      });
    }
    
    // Check if override already exists for this date
    const existingOverrideIndex = timeSlot.dateOverrides.findIndex(
      override => override.date.toISOString().split('T')[0] === overrideDate.toISOString().split('T')[0]
    );
    
    if (existingOverrideIndex >= 0) {
      // Update existing override
      timeSlot.dateOverrides[existingOverrideIndex] = {
        date: overrideDate,
        isAvailable,
        customSlots: customSlots || [],
        reason: reason || ''
      };
    } else {
      // Add new override
      timeSlot.dateOverrides.push({
        date: overrideDate,
        isAvailable,
        customSlots: customSlots || [],
        reason: reason || ''
      });
    }
    
    await timeSlot.save();
    
    res.json({
      message: `Date override for ${overrideDate.toISOString().split('T')[0]} ${isAvailable ? 'added' : 'updated'} successfully.`,
      override: {
        date: overrideDate.toISOString().split('T')[0],
        isAvailable,
        customSlots: customSlots || [],
        reason: reason || ''
      }
    });
    
  } catch (error) {
    console.error('Date override error:', error);
    res.status(500).json({
      message: 'Internal server error during date override operation.'
    });
  }
});

// Remove date override
router.delete('/date-override/:date', auth, async (req, res) => {
  try {
    const { date } = req.params;
    
    const business = await Business.findOne({ user: req.user.userId });
    if (!business) {
      return res.status(404).json({
        message: 'Business information not found.'
      });
    }
    
    const overrideDate = new Date(date);
    if (isNaN(overrideDate.getTime())) {
      return res.status(400).json({
        message: 'Invalid date format. Use YYYY-MM-DD format.'
      });
    }
    
    const dayOfWeek = overrideDate.getDay();
    const timeSlot = await TimeSlot.findOne({ 
      business: business._id, 
      dayOfWeek: dayOfWeek 
    });
    
    if (!timeSlot) {
      return res.status(404).json({
        message: 'No time slot configuration found for this day.'
      });
    }
    
    const initialLength = timeSlot.dateOverrides.length;
    timeSlot.dateOverrides = timeSlot.dateOverrides.filter(
      override => override.date.toISOString().split('T')[0] !== overrideDate.toISOString().split('T')[0]
    );
    
    if (timeSlot.dateOverrides.length === initialLength) {
      return res.status(404).json({
        message: `No override found for date ${overrideDate.toISOString().split('T')[0]}.`
      });
    }
    
    await timeSlot.save();
    
    res.json({
      message: `Date override for ${overrideDate.toISOString().split('T')[0]} removed successfully.`
    });
    
  } catch (error) {
    console.error('Remove date override error:', error);
    res.status(500).json({
      message: 'Internal server error during date override removal.'
    });
  }
});

// Get availability for a date range
router.post('/availability-range', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        message: 'Start date and end date are required.'
      });
    }
    
    const business = await Business.findOne({ user: req.user.userId });
    if (!business) {
      return res.status(404).json({
        message: 'Business information not found.'
      });
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        message: 'Invalid date format. Use YYYY-MM-DD format.'
      });
    }
    
    if (start > end) {
      return res.status(400).json({
        message: 'Start date must be before end date.'
      });
    }
    
    const timeSlots = await TimeSlot.find({ 
      business: business._id, 
      isActive: true 
    });
    
    const availability = [];
    const currentDate = new Date(start);
    
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayOfWeek = currentDate.getDay();
      
      let availableSlots = [];
      let isDateAvailable = false;
      
      // Check for date overrides first
      for (let timeSlot of timeSlots) {
        const override = timeSlot.dateOverrides.find(
          o => o.date.toISOString().split('T')[0] === dateStr
        );
        
        if (override) {
          if (override.isAvailable && override.customSlots && override.customSlots.length > 0) {
            availableSlots = override.customSlots.filter(slot => slot.isActive !== false);
            isDateAvailable = availableSlots.length > 0;
          }
          break;
        }
      }
      
      // If no override found, check regular schedule
      if (!isDateAvailable) {
        const regularSlot = timeSlots.find(ts => ts.dayOfWeek === dayOfWeek);
        if (regularSlot) {
          availableSlots = regularSlot.slots.filter(slot => slot.isActive !== false);
          isDateAvailable = availableSlots.length > 0;
        }
      }
      
      availability.push({
        date: dateStr,
        dayName: DAY_NAMES[dayOfWeek],
        isAvailable: isDateAvailable,
        slots: availableSlots
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    res.json({
      availability,
      dateRange: {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
      }
    });
    
  } catch (error) {
    console.error('Get availability range error:', error);
    res.status(500).json({
      message: 'Internal server error during availability range check.'
    });
  }
});

module.exports = router;