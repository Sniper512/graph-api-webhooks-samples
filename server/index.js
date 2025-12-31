/**
 * Copyright 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

require("dotenv").config();

const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const express = require("express");
const cors = require("cors");
const xhub = require("express-x-hub");
const axios = require("axios");

// Import routes
const authRoutes = require("../routes/auth");
const instagramRoutes = require("../routes/instagram");
const businessRoutes = require("../routes/business");
const faqRoutes = require("../routes/faqs");
const adminRoutes = require("../routes/admin");
const timeSlotRoutes = require("../routes/timeslots");
const googleCalendarRoutes = require("../routes/googleCalendar");

// Import models
const Conversation = require("../models/Conversation");
const { google } = require('googleapis');

const app = express();

app.set("port", process.env.PORT || 5000);

// Connect to MongoDB
mongoose
	.connect(process.env.DB_URL)
	.then(() => {
		console.log("Connected to MongoDB");
		// Note: Auto-archiving disabled for MVP - keeping all conversation history
		// Uncomment below to enable auto-archiving after 7 days:
		// setInterval(() => {
		// 	Conversation.archiveOldConversations()
		// 		.then(() => console.log("✅ Old conversations archived"))
		// 		.catch(err => console.error("❌ Error archiving conversations:", err));
		// }, 24 * 60 * 60 * 1000); // Run daily
	})
	.catch((err) => console.error("MongoDB connection error:", err));

app.listen(app.get("port"));

// CORS configuration - allow multiple origins
const allowedOrigins = [
	process.env.FRONTEND_URL_LOCAL || 'http://localhost:5173',
	process.env.FRONTEND_URL_DEV || 'http://localhost:3000',
	'https://meta-user-dashboard.vercel.app',
	'https://meta-app-admin-dashboard.vercel.app',
	process.env.FRONTEND_URL,
	process.env.ADMIN_FRONTEND_URL
].filter(Boolean);

app.use(
	cors({
		origin: function (origin, callback) {
			// Allow requests with no origin (mobile apps, Postman, etc.)
			if (!origin) return callback(null, true);
			
			if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
				callback(null, true);
			} else {
				callback(null, true); // Allow all origins for now
			}
		},
		credentials: true,
		methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Key"],
	})
);

app.use(xhub({ algorithm: "sha1", secret: process.env.APP_SECRET }));


app.use(bodyParser.json());

// Session middleware for storing temporary data
const session = require('express-session');
app.use(session({
  secret: process.env.APP_SECRET || 'your_session_secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Mount auth routes
app.use("/api/auth", authRoutes);

// Mount Instagram routes
app.use("/api/instagram", instagramRoutes);

// Mount business routes
app.use("/api/business", businessRoutes);

// Mount FAQ routes
app.use("/api/faqs", faqRoutes);

// Mount Admin routes
app.use("/api/admin", adminRoutes);

// Mount time slot routes
app.use("/api/timeslots", timeSlotRoutes);

// Mount Google Calendar routes
app.use("/api/google-calendar", googleCalendarRoutes);

var token = process.env.TOKEN || "token";
var received_updates = [];

// Tool functions for booking
const getGoogleCalendarRedirectUri = () => {
  // Check if we're in production
  if (process.env.NODE_ENV === 'production' || process.env.GOOGLE_CALENDAR_REDIRECT_URI_PROD) {
    return process.env.GOOGLE_CALENDAR_REDIRECT_URI_PROD || process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  }
  return process.env.GOOGLE_CALENDAR_REDIRECT_URI_LOCAL || process.env.GOOGLE_CALENDAR_REDIRECT_URI;
};

async function refreshAccessTokenIfNeeded(user) {
  const now = new Date();
  if (user.googleCalendarTokenExpiry && user.googleCalendarTokenExpiry <= now) {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CALENDAR_CLIENT_ID,
        process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
        getGoogleCalendarRedirectUri()
      );
      oauth2Client.setCredentials({ refresh_token: user.googleCalendarRefreshToken });
      const { credentials } = await oauth2Client.refreshAccessToken();
      user.googleCalendarAccessToken = credentials.access_token;
      user.googleCalendarTokenExpiry = new Date(credentials.expiry_date);
      await user.save();
    } catch (error) {
      console.error('❌ Failed to refresh Google Calendar access token:', error);
      // Mark integration as disconnected if refresh fails
      user.googleCalendarIntegrationStatus = 'disconnected';
      user.googleCalendarAccessToken = null;
      user.googleCalendarRefreshToken = null;
      user.googleCalendarTokenExpiry = null;
      await user.save();
      throw new Error('Google Calendar authentication expired. Please reconnect.');
    }
  }
  return user.googleCalendarAccessToken;
}

// Helper function to generate proper date ranges for booking
function generateBookingDateRange() {
  const today = new Date();
  const startDate = new Date(today);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 14); // Next 14 days
  
  const formatISODate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  return {
    startDate: formatISODate(startDate),
    endDate: formatISODate(endDate)
  };
}
async function getAvailableBookingSlots(userId, startDate, endDate) {
  try {
    console.log(`🔍 Getting available slots for user ${userId}, dates: ${startDate} to ${endDate}`);
    const Business = require("../models/Business");
    const business = await Business.findOne({ user: userId });
    console.log(`🏢 Business found:`, !!business);
    if (!business) return { availableSlots: [] };

    const TimeSlot = require("../models/TimeSlot");
    const timeSlots = await TimeSlot.find({ business: business._id, isActive: true });
    console.log(`⏰ Time slots found: ${timeSlots.length}`);

    const User = require("../models/User");
    const user = await User.findById(userId);
    console.log(`👤 User Google Calendar status:`, user?.googleCalendarIntegrationStatus);

    // Get business timezone early for Google Calendar queries
    const businessTimezone = business.timezone || 'UTC';
    console.log(`🌍 Business timezone: ${businessTimezone}`);

    let bookings = [];
    if (user && user.googleCalendarIntegrationStatus === 'connected') {
      console.log(`📅 Fetching existing bookings from Google Calendar...`);
      const accessToken = await refreshAccessTokenIfNeeded(user);
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CALENDAR_CLIENT_ID,
        process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
        process.env.GOOGLE_CALENDAR_REDIRECT_URI
      );
      oauth2Client.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      // Query Google Calendar using business timezone
      // Get midnight of start date and end of end date in business timezone
      const startDateObj = new Date(startDate + 'T00:00:00');
      const endDateObj = new Date(endDate + 'T23:59:59');

      // Format as ISO strings (Google Calendar handles timezone conversion)
      const timeMin = startDateObj.toISOString();
      const timeMax = endDateObj.toISOString();
      console.log(`📅 Calendar query range: ${timeMin} to ${timeMax} (${businessTimezone})`);

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime'
      });
      bookings = response.data.items.filter(event => {
        const summary = (event.summary || '').toLowerCase();
        const description = (event.description || '').toLowerCase();
        return summary.includes('booking') || description.includes('booking');
      });
      console.log(`📅 Existing bookings found: ${bookings.length}`);
    }


    console.log(`🔄 Calculating available slots...`);
    const availableSlots = [];

    // Helper function to convert time string to minutes
    const timeToMinutes = (timeStr) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };

    // Helper function to convert minutes to time string
    const minutesToTime = (minutes) => {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    };

    // Helper to get timezone offset (e.g., "+05:00")
    const getTzOffset = (date) => {
      try {
        const str = date.toLocaleString('en-US', { timeZone: businessTimezone, timeZoneName: 'longOffset' });
        const match = str.match(/GMT([+-]\d{2}):?(\d{2})/);
        if (match) {
          return `${match[1]}:${match[2]}`;
        }
        return '+00:00';
      } catch (e) {
        console.error('Error getting timezone offset:', e);
        return '+00:00';
      }
    };

    // Parse start and end dates properly in business timezone
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      // Get the date string in YYYY-MM-DD format
      const dateStr = d.toISOString().split('T')[0];

      // Get day of week in business timezone (CRITICAL FIX)
      const dateInBusinessTz = new Date(dateStr + 'T12:00:00'); // Use noon to avoid DST edge cases
      const dayName = dateInBusinessTz.toLocaleDateString('en-US', {
        timeZone: businessTimezone,
        weekday: 'long'
      });
      const dayOfWeek = dateInBusinessTz.toLocaleDateString('en-US', {
        timeZone: businessTimezone,
        weekday: 'short'
      });

      // Convert day name to number (0=Sunday, 1=Monday, etc.)
      const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
      const dayOfWeekNum = dayMap[dayOfWeek];
      const daySlots = timeSlots.filter(ts => ts.dayOfWeek === dayOfWeekNum);
      console.log(`📅 Day ${dateStr} (${dayName}): ${daySlots.length} time slots configured`);

      if (daySlots.length === 0) continue;

      for (const ts of daySlots) {
        console.log(`  ⏰ TimeSlot ID ${ts._id}: ${ts.slots.length} slot configurations`);
        
        for (const slot of ts.slots) {
          if (!slot.isActive) {
            console.log(`    ❌ Slot ${slot.startTime}-${slot.endTime} is inactive`);
            continue;
          }
          
          console.log(`    ✅ Slot ${slot.startTime}-${slot.endTime} (${slot.duration}min, max ${slot.maxBookings} bookings) is active`);
          
          // Generate individual appointment slots based on duration
          const startMinutes = timeToMinutes(slot.startTime);
          const endMinutes = timeToMinutes(slot.endTime);
          const duration = slot.duration;
          const maxBookings = slot.maxBookings || 1;
          
          console.log(`      🔄 Generating individual ${duration}-minute appointment slots...`);
          
          // Create individual appointment slots (e.g., 9:00-9:30, 9:30-10:00, etc.)
          for (let currentMinutes = startMinutes; currentMinutes + duration <= endMinutes; currentMinutes += duration) {
            const offset = getTzOffset(dateInBusinessTz);
            const appointmentStartTime = minutesToTime(currentMinutes);
            const appointmentEndTime = minutesToTime(currentMinutes + duration);

            // Create dates using the business timezone offset
            // format: 2025-12-29T09:00:00+05:00
            const startDateTimeStr = `${dateStr}T${appointmentStartTime}:00${offset}`;
            const endDateTimeStr = `${dateStr}T${appointmentEndTime}:00${offset}`;

            // Create Date objects for comparison (these get converted to UTC internally)
            const appointmentStart = new Date(startDateTimeStr);
            const appointmentEnd = new Date(endDateTimeStr);

            // Count bookings that overlap with THIS specific appointment slot
            let bookingsInAppointment = 0;
            for (const booking of bookings) {
              const bStart = new Date(booking.start.dateTime || booking.start.date);
              const bEnd = new Date(booking.end.dateTime || booking.end.date);

              // Check if booking overlaps with this specific appointment time
              if (appointmentStart < bEnd && appointmentEnd > bStart) {
                bookingsInAppointment++;
                console.log(`        📊 Overlap found: ${booking.summary} (${bStart.toISOString()} - ${bEnd.toISOString()})`);
              }
            }

            const isAvailable = bookingsInAppointment < maxBookings;

            if (isAvailable) {
              console.log(`        ✅ ${appointmentStartTime}-${appointmentEndTime} available (${bookingsInAppointment}/${maxBookings})`);
              availableSlots.push({
                date: dateStr,
                dayOfWeek: dayOfWeekNum,
                dayName: dayName,
                startTime: appointmentStartTime,
                endTime: appointmentEndTime,
                // CRITICAL: Preserve timezone format for AI to use (DO NOT convert to UTC)
                startDateTime: startDateTimeStr,
                endDateTime: endDateTimeStr,
                duration: duration,
                currentBookings: bookingsInAppointment,
                maxBookings: maxBookings
              });
            } else {
              console.log(`        ❌ ${appointmentStartTime}-${appointmentEndTime} FULL (${bookingsInAppointment}/${maxBookings})`);
            }
          }
        }
      }
    }
    console.log(`✅ Available slots calculated: ${availableSlots.length}`);

    // Log first few slots with full details for debugging
    if (availableSlots.length > 0) {
      console.log(`\n📊 Sample slot details (first 3):`);
      availableSlots.slice(0, 3).forEach((slot, idx) => {
        console.log(`  ${idx + 1}. ${slot.dayName} ${slot.date} ${slot.startTime}-${slot.endTime}`);
        console.log(`     startDateTime: ${slot.startDateTime}`);
        console.log(`     endDateTime: ${slot.endDateTime}`);
      });
      console.log();
    }

    return { availableSlots };
  } catch (error) {
    console.error('❌ Error getting available slots:', error);
    return { availableSlots: [] };
  }
}
async function createBooking(userId, conversationId, senderId, platform, summary, start, end, description, attendeeEmail, attendeeName) {
  try {
    console.log(`\n🎯 ========== CREATE BOOKING CALLED ==========`);
    console.log(`📋 Summary: ${summary}`);
    console.log(`⏰ Start: ${start}`);
    console.log(`⏰ End: ${end}`);
    console.log(`📝 Description: ${description}`);
    console.log(`👤 Attendee: ${attendeeName} (${attendeeEmail})`);
    console.log(`🎯 ============================================\n`);

    const User = require("../models/User");
    const Booking = require("../models/Booking");
    const TimeSlot = require("../models/TimeSlot");
    const Business = require("../models/Business");

    const user = await User.findById(userId);
    if (!user || user.googleCalendarIntegrationStatus !== 'connected') {
      return { error: "Google Calendar not connected" };
    }
    
    const accessToken = await refreshAccessTokenIfNeeded(user);
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CALENDAR_CLIENT_ID,
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      process.env.GOOGLE_CALENDAR_REDIRECT_URI
    );
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Get business timezone (or use Google Calendar timezone as fallback)
    const businessInfo = await Business.findOne({ user: userId });
    let timezone = 'UTC'; // Default fallback
    
    if (businessInfo && businessInfo.timezone) {
      timezone = businessInfo.timezone;
      console.log(`📍 Using business timezone: ${timezone}`);
    } else {
      // Fallback to Google Calendar timezone
      const calendarInfo = await calendar.calendars.get({
        calendarId: 'primary'
      });
      timezone = calendarInfo.data.timeZone || 'UTC';
      console.log(`📍 Using Google Calendar timezone: ${timezone}`);
    }


    // CRITICAL: Check for conflicts before creating booking
    console.log(`🔍 Checking for conflicts: ${start} to ${end}`);

    const requestedStart = new Date(start);
    const requestedEnd = new Date(end);

    console.log(`🔍 Requested time range (parsed):`);
    console.log(`   Start: ${requestedStart.toISOString()} (${requestedStart.toString()})`);
    console.log(`   End: ${requestedEnd.toISOString()} (${requestedEnd.toString()})`);

    // Get existing bookings from Google Calendar for this time range
    const existingEvents = await calendar.events.list({
      calendarId: 'primary',
      timeMin: requestedStart.toISOString(),
      timeMax: requestedEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });

    console.log(`📅 Found ${existingEvents.data.items.length} existing events in this time range`);
    existingEvents.data.items.forEach((event, idx) => {
      const eventStart = new Date(event.start.dateTime || event.start.date);
      const eventEnd = new Date(event.end.dateTime || event.end.date);
      console.log(`   ${idx + 1}. "${event.summary}": ${eventStart.toISOString()} - ${eventEnd.toISOString()}`);
    });

    // Check if any existing event conflicts with the requested time
    const conflicts = existingEvents.data.items.filter(event => {
      const eventStart = new Date(event.start.dateTime || event.start.date);
      const eventEnd = new Date(event.end.dateTime || event.end.date);

      // Check for overlap: (StartA < EndB) and (EndA > StartB)
      const hasOverlap = requestedStart < eventEnd && requestedEnd > eventStart;

      if (hasOverlap) {
        console.log(`⚠️  CONFLICT: "${event.summary}"`);
        console.log(`     Event: ${eventStart.toISOString()} - ${eventEnd.toISOString()}`);
        console.log(`     Requested: ${requestedStart.toISOString()} - ${requestedEnd.toISOString()}`);
        console.log(`     Overlap check: ${requestedStart.toISOString()} < ${eventEnd.toISOString()} && ${requestedEnd.toISOString()} > ${eventStart.toISOString()}`);
      }

      return hasOverlap;
    });

    if (conflicts.length > 0) {
      console.log(`❌ Cannot create booking - ${conflicts.length} conflict(s) found`);
      return { 
        error: "This time slot is already booked. Please choose a different time.",
        conflicts: conflicts.map(c => ({
          summary: c.summary,
          start: c.start.dateTime || c.start.date,
          end: c.end.dateTime || c.end.date
        }))
      };
    }

    // Also check slot capacity limits (reuse businessInfo from above)
    if (businessInfo) {
      // Determine date in business timezone to get correct day of week
      const tz = businessInfo.timezone || 'UTC';
      const requestedDate = new Date(start);
      
      // Get day of week in business timezone
      const localDateStr = requestedDate.toLocaleString('en-US', { timeZone: tz });
      const localDate = new Date(localDateStr);
      const dayOfWeek = localDate.getDay();

      const timeSlots = await TimeSlot.find({ 
        business: businessInfo._id, 
        dayOfWeek: dayOfWeek,
        isActive: true 
      });

      // Get offset for constructing slot times
      const getTzOffset = (date) => {
        try {
          const str = date.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'longOffset' });
          const match = str.match(/GMT([+-]\d{2}:?\d{2})/);
          return match ? match[1] : '+00:00';
        } catch (e) {
          return '+00:00';
        }
      };
      
      const offset = getTzOffset(requestedDate);
      
      // Get YYYY-MM-DD in business timezone
      // We can use the parts from toLocaleString to be safe
      const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(requestedDate); // YYYY-MM-DD
      const businessDateStr = dateParts;

      // Check if this booking exceeds max bookings for the slot
      for (const ts of timeSlots) {
        for (const slot of ts.slots) {
          if (!slot.isActive) continue;
          
          // Construct slot times using business date and offset
          // format: 2025-12-29T09:00:00+05:00
          const slotStart = new Date(`${businessDateStr}T${slot.startTime}:00${offset}`);
          const slotEnd = new Date(`${businessDateStr}T${slot.endTime}:00${offset}`);
          
          // Check if requested time overlaps with this slot
          if (requestedStart < slotEnd && requestedEnd > slotStart) {
            console.log(`🔍 Checking capacity for slot ${slot.startTime}-${slot.endTime} (max: ${slot.maxBookings})`);
            
            // Count existing bookings that OVERLAP with this slot
            const overlappingBookings = existingEvents.data.items.filter(event => {
              const eStart = new Date(event.start.dateTime || event.start.date);
              const eEnd = new Date(event.end.dateTime || event.end.date);
              
              // Check if the existing event overlaps with this slot
              return eStart < slotEnd && eEnd > slotStart;
            });
            
            const bookingCount = overlappingBookings.length;
            console.log(`📊 Found ${bookingCount} overlapping bookings in this slot`);
            overlappingBookings.forEach((b, idx) => {
              console.log(`  ${idx + 1}. ${b.summary} (${new Date(b.start.dateTime || b.start.date).toISOString()} - ${new Date(b.end.dateTime || b.end.date).toISOString()})`);
            });

            if (bookingCount >= slot.maxBookings) {
              console.log(`❌ Slot capacity reached: ${bookingCount}/${slot.maxBookings} bookings`);
              return { 
                error: `This time slot has reached its maximum capacity (${slot.maxBookings} bookings). Please choose a different time.`
              };
            } else {
              console.log(`✅ Slot has capacity: ${bookingCount}/${slot.maxBookings} bookings`);
            }
          }
        }
      }
    }

    console.log(`✅ No conflicts found - proceeding with booking creation`);

    // Prepare datetime strings for Google Calendar
    // If they already have timezone offset (e.g., +05:00), use as-is
    // If they have 'Z' (UTC), remove it and add timezone separately
    const formatDateTime = (dateTimeStr) => {
      // Check if already has timezone offset like +05:00 or -08:00
      if (/[+-]\d{2}:\d{2}$/.test(dateTimeStr)) {
        // Already has timezone offset, use as-is
        return { dateTime: dateTimeStr };
      } else if (dateTimeStr.endsWith('Z')) {
        // Has UTC marker, remove and add timezone
        return { dateTime: dateTimeStr.slice(0, -1), timeZone: timezone };
      } else {
        // No timezone info, add timezone
        return { dateTime: dateTimeStr, timeZone: timezone };
      }
    };

    const event = {
      summary: `Booking: ${summary}`,
      description,
      start: formatDateTime(start),
      end: formatDateTime(end),
      attendees: attendeeEmail ? [{ email: attendeeEmail, displayName: attendeeName }] : []
    };

    console.log(`📅 Creating Google Calendar event:`, {
      summary: event.summary,
      start: event.start,
      end: event.end,
      timezone: timezone
    });

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event
    });

    // Save booking to database
    const booking = new Booking({
      userId,
      conversationId,
      senderId,
      platform,
      eventId: response.data.id,
      summary: `Booking: ${summary}`,
      description,
      start: {
        dateTime: start,
        timeZone: timezone
      },
      end: {
        dateTime: end,
        timeZone: timezone
      },
      attendees: attendeeEmail ? [{ email: attendeeEmail, displayName: attendeeName, responseStatus: 'needsAction' }] : []
    });

    await booking.save();
    console.log(`💾 Booking saved to database: ${booking._id} for conversation ${conversationId}`);

    return {
      eventId: response.data.id,
      bookingId: booking._id,
      status: 'created'
    };
  } catch (error) {
    console.error('Error creating booking:', error);
    return { error: 'Failed to create booking' };
  }
}
async function cancelBooking(userId, eventId) {
   try {
      const User = require("../models/User");
      const Booking = require("../models/Booking");
      const user = await User.findById(userId);
      if (!user || user.googleCalendarIntegrationStatus !== 'connected') {
         return { error: "Google Calendar not connected" };
      }
      const accessToken = await refreshAccessTokenIfNeeded(user);
      const oauth2Client = new google.auth.OAuth2(
         process.env.GOOGLE_CALENDAR_CLIENT_ID,
         process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
         process.env.GOOGLE_CALENDAR_REDIRECT_URI
      );
      oauth2Client.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      // Delete the event from Google Calendar
      await calendar.events.delete({
         calendarId: 'primary',
         eventId: eventId
      });

      // Delete booking from database
      const booking = await Booking.findOneAndDelete({ eventId, userId });

      if (booking) {
         console.log(`💾 Booking deleted from database: ${booking._id}`);
      }

      return { eventId, status: 'cancelled' };
   } catch (error) {
      console.error('Error cancelling booking:', error);
      return { error: 'Failed to cancel booking' };
   }
}
async function listUserBookings(conversationId, senderId, userId) {
  try {
    const Booking = require("../models/Booking");
    const bookings = await Booking.find({
      conversationId,
      senderId,
      userId,
      status: 'active'
    }).sort({ createdAt: -1 });

    console.log(`📋 Found ${bookings.length} active bookings for conversation ${conversationId}`);

    return {
      bookings: bookings.map(booking => ({
        id: booking._id,
        eventId: booking.eventId,
        summary: booking.summary,
        start: booking.start,
        end: booking.end,
        attendees: booking.attendees,
        createdAt: booking.createdAt
      }))
    };
  } catch (error) {
    console.error('Error listing user bookings:', error);
    return { error: 'Failed to list bookings' };
  }
}
// OpenAI API Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5";

// Function to get OpenAI response
async function getOpenAIResponse(userMessage, senderId, userId, platform = 'instagram') {
	try {
		console.log(`\n🤖 Sending to OpenAI (${OPENAI_MODEL})...`);
		console.log(`📝 User message: "${userMessage}"`);
		console.log(`👤 User ID: ${userId}`);

		// Get or create conversation from database
		const conversation = await Conversation.findOrCreate(senderId, platform, userId);
		const conversationHistory = conversation.getRecentMessages(10);

		// Fetch user-specific business information and FAQs from database
		let businessInfo = "";
		let faqContent = "";
		let businessName = "";

		if (userId) {
			// Fetch business information
			const Business = require("../models/Business");
			const business = await Business.findOne({ user: userId });

			if (business) {
				businessName = business.businessName;
				businessInfo =
					`A ${business.businessCategory} company. ` +
					`email address is ${business.email}` +
					(business.phoneNumber ? ` & phone number or contact number is ${business.phoneNumber}` : "") +
					(business.website ? `. & website is: ${business.website}` : "") +
					(business.businessDescription
						? `Other business description is: ${business.businessDescription}`
						: "") +
					(business.address ? `. business/office Location/address: ${business.address}` : "") +
					(business.timezone ? `. Our timezone is ${business.timezone}` : "");
			} else {
				businessInfo = "our business";
			}

			// Fetch FAQs
			const FAQ = require("../models/FAQ");
			const faqs = await FAQ.find({ user: userId }).sort({ createdAt: -1 });

			if (faqs.length > 0) {
				faqContent = "\n\n## BUSINESS FAQS\n\n";
				faqs.forEach((faq, index) => {
					faqContent += `**${faq.question}**\n${faq.answer}\n\n`;
				});
			} else {
				faqContent = "\n\n## BUSINESS FAQS\n\nNo FAQs have been added yet.\n\n";
			}
		}

		// Generate proper date range for booking
		const bookingDateRange = generateBookingDateRange();
		
		// Build messages array with conversation history
		const messages = [
			{
				role: "system",
				content:
					`You are a customer support agent representing ${businessName}. ${businessInfo} so act and talk like a human.` +
				"You are a helpful assistant that handles answers questions about the business in a human way and manage booking requests. Always use Friendly, warm, and professional tone. Miami vibe, relaxed but polished." +
				`IMPORTANT: All booking times are in the business's local timezone. When showing times to users, present them in a natural, user-friendly format. ` +
				`BOOKING ASSISTANCE: If a user expresses interest in booking an appointment, scheduling a session, or making a reservation, follow these steps: 1. Use the get_available_booking_slots tool to retrieve available time slots for the next 7-14 days. Use the date range: startDate=${bookingDateRange.startDate}, endDate=${bookingDateRange.endDate}. IMPORTANT: Always use the current year (${new Date().getFullYear()}) when generating dates. 2. HANDLING AVAILABILITY RESULTS: After calling get_available_booking_slots, check the response carefully: - IF availableSlots array is EMPTY or has 0 slots: Tell the user "Unfortunately, there are no available time slots on [specified day]." DO NOT say "here are the available slots" when there are none. - IF availableSlots has slots: Present 3-5 available options to the user in a clear, easy-to-read format using bullet points. When presenting dates, ALWAYS use the exact 'dayName' field provided in the tool response (e.g., if the response shows dayName: \"Monday\" and date: \"2025-12-16\", present it as \"Monday, December 16, 2025\"). NEVER calculate or guess the day name yourself - always use the dayName from the response. DO NOT omit the day of the week under any circumstances. 3. BEFORE creating a booking, you MUST collect the following information from the user in bullet form: - Full name (required) - Email (required) - Purpose of the appointment (required) 4. Ask the user to confirm which time works best for them. 5. Once they confirm a specific time AND you have all required information, use the create_booking tool. ABSOLUTELY CRITICAL - DATETIME FORMAT: The get_available_booking_slots response contains BOTH 'startTime' and 'startDateTime' fields. YOU MUST IGNORE startTime and endTime fields completely. YOU MUST ONLY use the 'startDateTime' and 'endDateTime' fields which contain the complete timezone-aware datetime string. EXAMPLE: If get_available_booking_slots returns: {date: \"2025-12-29\", startTime: \"08:00\", endTime: \"09:00\", startDateTime: \"2025-12-29T08:00:00+05:00\", endDateTime: \"2025-12-29T09:00:00+05:00\"}, then call create_booking with: {start: \"2025-12-29T08:00:00+05:00\", end: \"2025-12-29T09:00:00+05:00\"}. CORRECT FORMAT: \"2025-12-29T08:00:00+05:00\" (copy startDateTime exactly). WRONG FORMATS: \"2025-12-29T08:00:00Z\", \"2025-12-29T08:00:00.000Z\", \"2025-12-29T08:00:00\" (DO NOT construct these). The startDateTime field already has the correct timezone - use it exactly as is. 6. CRITICAL: If create_booking returns an error (especially \"time slot is already booked\" or \"maximum capacity reached\"), do NOT claim the booking was successful. Instead: a) Apologize and explain the time is no longer available, b) Immediately call get_available_booking_slots again to get fresh availability, c) Offer 3-5 alternative time slots to the user. If any required information is missing, do NOT proceed with booking and instead ask the user to provide the missing details.

CANCELLATION+ WORKFLOW - EXECUTE THIS STEP BY STEP:
STEP 1: When user mentions cancelling a booking, FIRST call list_user_bookings tool to get their current bookings.
STEP 2: After receiving booking data from list_user_bookings, check if user wants to cancel:
			- If they have 1 booking and want to cancel it → CALL cancel_booking WITH eventId from the booking data
			- If they have multiple bookings → show list and ask which one
			- If they provide eventId directly → CALL cancel_booking immediately

AVAILABLE TOOLS FOR CANCELLATION:
- list_user_bookings: Gets user's current bookings (returns array with eventId for each)
- cancel_booking: Cancels a booking (requires eventId parameter)

CRITICAL RULES:
- NEVER claim cancellation is done unless you actually CALL cancel_booking tool
- After calling cancel_booking, tell user "Your booking has been cancelled"
- If cancel_booking fails, tell user there was an error and they should contact support
- Always use the eventId returned by list_user_bookings when calling cancel_booking

GENERAL QUESTIONS: For questions about the business that are not booking-related,
use ONLY the following FAQs to answer when possible.
IMPORTANT: learn user tone and language and follow the same tone and language. 
IMPORTANT: if question is about services or products and there is no information about that service or product or inquiry in the FAQs and description, just say "Sorry, we do not provide this service at the moment." and rather list all the services that we offer.
IMPORTANT: Keep your responses concise and under 500 characters total. If providing multiple FAQ answers, limit to 2-3 most relevant ones.
Be helpful but brief - Instagram has message length limits.
CRITICAL: Never use any external knowledge, training data, or generic information.
if question is about the business location and it does not match with given business location from faqs, share the correct location.
if question is not related to business or bookings from any context, politely refuse to answer. Light, subtle humor is acceptable when appropriate.
No jokes, no sarcasm, no motivation quotes, do not take any assumption from the internet. always keep the business context in mind and lead the conversation accordingly.

CRITICAL FORMATTING RULE - BULLET POINTS FOR LISTS:
When listing 2 or more items (services, products, features, options, etc.), you MUST use bullet points on separate lines. NEVER use commas or "and" to list multiple items.

CORRECT FORMAT:
"Our services include:
• [service 1]
• [service 2]
• [service 3]
• [service 4]"

WRONG FORMAT (DO NOT USE):
"Our services include [service 1], [service 2], [service 3]."

Always use the bullet point character (•) at the start of each line. This makes responses much easier to read on mobile devices.
If you don't have specific information about something in the provided business info or FAQs, try to build context from the conversation history and our services. If still nothing meaningful is found then respond ONLY with: 'I don't have that specific information right now. One of our team members will connect with you shortly to provide the details you need.'
Do NOT provide ANY generic, assumed, or external information about addresses, or businesses.
CONTEXT AWARENESS: You have access to the full conversation history. Use previous messages to maintain context and provide relevant responses. Reference earlier parts of the conversation when appropriate.` +
						faqContent,
			},
		];

		// Add conversation history from database
		conversationHistory.forEach((msg) => {
			if (msg.role !== 'system') {
				messages.push({
					role: msg.role,
					content: msg.content,
				});
			}
		});

		// Add current user message
		messages.push({
		  role: "user",
		  content: userMessage,
		});

		// Function definitions for tool calls
		const tools = [
		  {
		    type: "function",
		    function: {
		      name: "get_available_booking_slots",
		      description: "Get available time slots for booking appointments with the business",
		      parameters: {
		        type: "object",
		        properties: {
		          startDate: { type: "string", description: "Start date in YYYY-MM-DD format" },
		          endDate: { type: "string", description: "End date in YYYY-MM-DD format" }
		        },
		        required: ["startDate", "endDate"]
		      }
		    }
		  },
		  {
		    type: "function",
		    function: {
		      name: "create_booking",
		      description: "Create a new booking appointment on the calendar. CRITICAL: You must use the exact 'startDateTime' and 'endDateTime' values from get_available_booking_slots response. DO NOT use startTime/endTime, DO NOT construct datetime strings, DO NOT add 'Z' suffix. Copy startDateTime and endDateTime exactly as provided.",
		      parameters: {
		        type: "object",
		        properties: {
		          summary: { type: "string", description: "Booking title or service type" },
		          start: { type: "string", description: "MUST be the exact 'startDateTime' value from get_available_booking_slots (e.g. '2025-12-29T08:00:00+05:00'). DO NOT construct from date+startTime. DO NOT use UTC/Z format." },
		          end: { type: "string", description: "MUST be the exact 'endDateTime' value from get_available_booking_slots (e.g. '2025-12-29T09:00:00+05:00'). DO NOT construct from date+endTime. DO NOT use UTC/Z format." },
		          description: { type: "string", description: "Additional details about the booking" },
		          attendeeEmail: { type: "string", description: "Email of the person booking" },
		          attendeeName: { type: "string", description: "Name of the person booking" }
		        },
		        required: ["summary", "start", "end"]
		      }
		    }
		  },
		  {
		    type: "function",
		    function: {
		      name: "cancel_booking",
		      description: "Cancel an existing booking appointment",
		      parameters: {
		        type: "object",
		        properties: {
		          eventId: { type: "string", description: "The Google Calendar event ID of the booking to cancel" }
		        },
		        required: ["eventId"]
		      }
		    }
		  },
		  {
		    type: "function",
		    function: {
		      name: "list_user_bookings",
		      description: "List all active bookings for the current conversation/user",
		      parameters: {
		        type: "object",
		        properties: {},
		        required: []
		      }
		    }
		  }
		];

		// Function to make API call and handle responses
		async function makeOpenAICall(msgs, toolCalls = null) {
			const requestBody = {
			  model: OPENAI_MODEL,
			  messages: msgs,
			  max_completion_tokens: 500,
			};



			// Add tools only if not in a function call response
			if (!toolCalls) {
				requestBody.tools = tools;
			}

			const response = await axios.post(
				"https://api.openai.com/v1/chat/completions",
				requestBody,
				{
					headers: {
						Authorization: `Bearer ${OPENAI_API_KEY}`,
						"Content-Type": "application/json",
					},
				}
			);

			return response.data;
		}

		// Make initial API call
		let response = await makeOpenAICall(messages);
		let aiResponse = "";
		let maxToolCalls = 3; // Prevent infinite loops
		let toolCallCount = 0;

		// Handle function calls in a loop to allow multiple rounds without intermediate messaging
		while (response.choices[0].message.tool_calls &&
			response.choices[0].message.tool_calls.length > 0 &&
			toolCallCount < maxToolCalls) {

			toolCallCount++;
			const choice = response.choices[0];
			const toolCalls = choice.message.tool_calls;

			console.log(`\n🔧 Function calls detected (round ${toolCallCount}): ${toolCalls.length} calls`);
			toolCalls.forEach((call, index) => {
				console.log(`  ${index + 1}. ${call.function.name}`);
			});

			// Add the assistant's message with tool calls to the conversation
			messages.push(choice.message);

			// Execute ALL tool calls in sequence and collect results
			console.log(`🔧 Executing ${toolCalls.length} tool calls in sequence...`);
			for (const toolCall of toolCalls) {
				const functionName = toolCall.function.name;
				const functionArgs = JSON.parse(toolCall.function.arguments || "{}");

				try {
					let toolResult = "";

					if (functionName === "get_available_booking_slots") {
						console.log(`🔧 Executing get_available_booking_slots with args:`, functionArgs);
						// Use provided dates or generate default range
						let startDate = functionArgs.startDate;
						let endDate = functionArgs.endDate;

						// Validate dates - if invalid or missing, use current year
						const currentDate = new Date();
						const currentYear = currentDate.getFullYear();

						if (!startDate || !endDate) {
							const dateRange = generateBookingDateRange();
							startDate = dateRange.startDate;
							endDate = dateRange.endDate;
							console.log(`📅 Using generated date range: ${startDate} to ${endDate}`);
						} else {
							console.log(`📅 Using provided date range: ${startDate} to ${endDate}`);

							// Basic validation - ensure dates are not too far in past/future
							const start = new Date(startDate);
							const end = new Date(endDate);
							const now = new Date();
							const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
							const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

							if (start < oneYearAgo || start > oneYearFromNow || end < oneYearAgo || end > oneYearFromNow) {
								console.log(`❌ Date range too far from current date, using default range`);
								const dateRange = generateBookingDateRange();
								startDate = dateRange.startDate;
								endDate = dateRange.endDate;
							} else if (end <= start) {
								console.log(`❌ Invalid date range: end (${endDate}) <= start (${startDate}), using default range`);
								const dateRange = generateBookingDateRange();
								startDate = dateRange.startDate;
								endDate = dateRange.endDate;
								console.log(`🔄 Using fallback date range: ${startDate} to ${endDate}`);
							}
						}

						const slots = await getAvailableBookingSlots(userId, startDate, endDate);
						toolResult = JSON.stringify(slots);
						console.log(`📅 Available slots result:`, slots);
					} else if (functionName === "create_booking") {
						const booking = await createBooking(
							userId,
							conversation._id,
							senderId,
							platform,
							functionArgs.summary,
							functionArgs.start,
							functionArgs.end,
							functionArgs.description || "",
							functionArgs.attendeeEmail,
							functionArgs.attendeeName
						);
						toolResult = JSON.stringify(booking);
					} else if (functionName === "cancel_booking") {
						console.log(`🔧 Executing cancel_booking with eventId: ${functionArgs.eventId}`);
						const cancellation = await cancelBooking(userId, functionArgs.eventId);
						toolResult = JSON.stringify(cancellation);
						console.log(`📅 Cancellation result:`, cancellation);
						console.log(`💾 Booking cancelled in database`);
					} else if (functionName === "list_user_bookings") {
						console.log(`🔧 Executing list_user_bookings for conversation ${conversation._id}`);
						const bookings = await listUserBookings(conversation._id, senderId, userId);
						toolResult = JSON.stringify(bookings);
						console.log(`📋 User bookings result: ${bookings.bookings?.length || 0} bookings`);
					} else {
						toolResult = JSON.stringify({ error: "Unknown function" });
					}

					// Add tool result to messages
					messages.push({
						role: "tool",
						tool_call_id: toolCall.id,
						content: toolResult
					});
					console.log(`🔧 Tool result added to messages:`, toolResult);

				} catch (toolError) {
					console.error(`\n❌ Tool execution error:`, toolError);
					messages.push({
						role: "tool",
						tool_call_id: toolCall.id,
						content: JSON.stringify({ error: toolError.message || "Tool execution failed" })
					});
				}
			}

			// Make API call with tool results (may result in more tool calls or final response)
			console.log(`🤖 Making API call with tool results (round ${toolCallCount})...`);
			response = await makeOpenAICall(messages);
		}

		// Get final response
		const finalChoice = response.choices[0];
		aiResponse = finalChoice.message.content || "I'm not sure how to respond to that.";

		console.log(`\n✅ Final OpenAI Response:\n${aiResponse}\n`);
		console.log(`📊 Response metadata:`, {
			finish_reason: finalChoice.finish_reason,
			has_tool_calls: !!finalChoice.message.tool_calls,
			content_length: aiResponse.length
		});

		// Save both messages to database
		await conversation.addMessage('user', userMessage);
		await conversation.addMessage('assistant', aiResponse);

		return aiResponse;
	} catch (error) {
		console.error(
			"\n❌ OpenAI API Error:",
			error.response?.data || error.message
		);
		return "Sorry, I'm having trouble processing your message right now. Please try again later.";
	}
}

// Function to send Instagram message
async function sendInstagramMessage(
	recipientId,
	messageText,
	accessToken,
	accountId
) {
	try {
		const response = await axios.post(
			`https://graph.instagram.com/v24.0/${accountId}/messages`,
			{
				recipient: {
					id: recipientId,
				},
				message: {
					// Clean Markdown characters (** or __ for bold, * or _ for italic, ` for code)
					text: messageText
						.replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold **text**
						.replace(/__(.*?)__/g, '$1')     // Remove bold __text__
						.replace(/\*(.*?)\*/g, '$1')     // Remove italic *text*
						.replace(/_(.*?)_/g, '$1')       // Remove italic _text_
						.replace(/`(.*?)`/g, '$1')       // Remove code `text`
						.replace(/^\s*[-•]\s+/gm, '• ')   // Normalize list bullets
				},
			},
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
			}
		);
		console.log("Instagram message sent successfully:", response.data);
		return response.data;
	} catch (error) {
		console.error(
			"Instagram Send API Error:",
			error.response?.data || error.message
		);
		throw error;
	}
// Function to fetch Instagram user profile
async function getInstagramUserProfile(userId, accessToken) {
	try {
		const response = await axios.get(
			`https://graph.instagram.com/${userId}?fields=username&access_token=${accessToken}`
		);
		return {
			username: response.data.username,
			profilePicture: null // Profile pictures not available for IG Business scoped IDs
		};
	} catch (error) {
		console.error(
			"Instagram User Profile API Error:",
			error.response?.data || error.message
		);
		return {
			username: null,
			profilePicture: null
		};
	}
}
}

// Function to send WhatsApp message
async function sendWhatsAppMessage(recipientId, messageText) {
	try {
		const response = await axios.post(
			`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONENUM_ID}/messages`,
			{
				messaging_product: "whatsapp",
				to: recipientId,
				type: "text",
				text: {
					body: messageText,
				},
			},
			{
				headers: {
					Authorization: `Bearer ${process.env.WHATSAPP_ACCOUNT_ACCESS_TOKEN}`,
					"Content-Type": "application/json",
				},
			}
		);
		console.log("WhatsApp message sent successfully:", response.data);
		return response.data;
	} catch (error) {
		console.error(
			"WhatsApp Send API Error:",
			error.response?.data || error.message
		);
		throw error;
	}
}

app.get("/", function (req, res) {
	console.log(req);
	res.send("<pre>" + JSON.stringify(received_updates, null, 2) + "</pre>");
});

app.get("/privacy-policy", function (req, res) {
	res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Privacy Policy</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; line-height: 1.6; }
        h1 { color: #333; }
        h2 { color: #555; margin-top: 30px; }
        p { color: #666; }
      </style>
    </head>
    <body>
      <h1>Privacy Policy</h1>
      <p><strong>Last Updated:</strong> October 28, 2025</p>
      
      <h2>1. Information We Collect</h2>
      <p>We collect information you provide when you interact with our Instagram bot, including:</p>
      <ul>
        <li>Instagram username and profile information</li>
        <li>Messages you send to our Instagram account</li>
        <li>Message timestamps and metadata</li>
      </ul>
      
      <h2>2. How We Use Your Information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Respond to your messages and inquiries</li>
        <li>Improve our service and user experience</li>
        <li>Comply with legal obligations</li>
      </ul>
      
      <h2>3. Data Retention</h2>
      <p>We retain your information only as long as necessary to provide our services and as required by law.</p>
      
      <h2>4. Data Security</h2>
      <p>We implement appropriate security measures to protect your information from unauthorized access, alteration, or disclosure.</p>
      
      <h2>5. Third-Party Services</h2>
      <p>Our service uses Instagram's Messaging API provided by Meta Platforms, Inc. Your use of Instagram is also subject to Instagram's Terms of Service and Privacy Policy.</p>
      
      <h2>6. Your Rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access your personal information</li>
        <li>Request deletion of your data</li>
        <li>Opt-out of communications</li>
      </ul>
      
      <h2>7. Contact Us</h2>
      <p>If you have questions about this Privacy Policy, please contact us through Instagram Direct Messages.</p>
      
      <h2>8. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.</p>
    </body>
    </html>
  `);
});

app.get("/facebook", function (req, res) {
	if (
		req.query["hub.mode"] == "subscribe" &&
		req.query["hub.verify_token"] == token
	) {
		res.send(req.query["hub.challenge"]);
	} else {
		res.sendStatus(400);
	}
});

app.get("/instagram", function (req, res) {
	if (
		req.query["hub.mode"] == "subscribe" &&
		req.query["hub.verify_token"] == token
	) {
		res.send(req.query["hub.challenge"]);
	} else {
		res.sendStatus(400);
	}
});

app.get("/threads", function (req, res) {
	if (
		req.query["hub.mode"] == "subscribe" &&
		req.query["hub.verify_token"] == token
	) {
		res.send(req.query["hub.challenge"]);
	} else {
		res.sendStatus(400);
	}
});

app.get("/whatsapp", function (req, res) {
	if (
		req.query["hub.mode"] == "subscribe" &&
		req.query["hub.verify_token"] == token
	) {
		res.send(req.query["hub.challenge"]);
	} else {
		res.sendStatus(400);
	}
});

app.post("/facebook", function (req, res) {
	console.log("Facebook request body:", req.body);

	if (!req.isXHubValid()) {
		console.log(
			"Warning - request header X-Hub-Signature not present or invalid"
		);
		res.sendStatus(401);
		return;
	}

	console.log("request header X-Hub-Signature validated");
	// Process the Facebook updates here
	received_updates.unshift(req.body);
	res.sendStatus(200);
});

app.post("/instagram", async function (req, res) {
	console.log("Instagram request body:");
	console.log(JSON.stringify(req.body, null, 2));

	// Store the received update
	received_updates.unshift(req.body);

	// Respond to webhook immediately (required by Meta)
	res.sendStatus(200);

	// Process the message asynchronously
	try {
		if (req.body.object === "instagram") {
			for (const entry of req.body.entry) {
				if (entry.messaging) {
					for (const messagingEvent of entry.messaging) {
						// Check if it's an incoming message (not an echo)
						if (
							messagingEvent.message &&
							messagingEvent.message.text &&
							!messagingEvent.message.is_echo
						) {
							const senderId = messagingEvent.sender.id;
							console.log("=== Sender ===:", messagingEvent.sender);
							const recipientId = messagingEvent.recipient.id;
							const userMessage = messagingEvent.message.text;

							console.log(`\n📨 New Instagram Message:`);
							console.log(`   From: ${senderId}`);
							console.log(`   To: ${recipientId}`);
							console.log(`   Message: "${userMessage}"`);

							// Find the user by their Instagram account ID
							const User = require("../models/User");
							const user = await User.findOne({
								instagramAccountId: recipientId,
							});

							// Check if Instagram webhook is paused for this user
							if (user && user.instagramWebhookPaused) {
								console.log(`⏸️  Instagram webhook is paused for user ${user._id}. Message not processed.`);
								return; // Skip processing
							}

						if (user && user.instagramAccessToken) {
							// Get AI response with conversation context (pass 'instagram' as platform)
							const aiResponse = await getOpenAIResponse(
								userMessage,
								senderId,
								user._id,
								'instagram'
							);

							// Send reply to Instagram using user's token
								try {
									console.log(`\n📤 Sending reply to Instagram...`);
									await sendInstagramMessage(
										senderId,
										aiResponse,
										user.instagramAccessToken,
										recipientId
									);
									console.log(`✅ Reply sent successfully!\n`);
								} catch (sendError) {
									console.log(`\n❌ Failed to send Instagram reply`);
									console.log(
										`💡 The user's Instagram Access Token may be expired or invalid`
									);
									console.log(
										`   User needs to update their token via /api/instagram/set-access-token\n`
									);
								}
							} else {
								console.log(
									`⚠️  Skipping - no user found with Instagram account ID ${recipientId} or no access token set\n`
								);
							}
						}
					}
				}
			}
		}
	} catch (error) {
		console.error("Error processing Instagram message:", error);
	}
});

app.post("/threads", function (req, res) {
	console.log("Threads request body:");
	console.log(req.body);
	// Process the Threads updates here
	received_updates.unshift(req.body);
	res.sendStatus(200);
});

app.post("/whatsapp", async function (req, res) {
	console.log("WhatsApp request body:");
	console.log(JSON.stringify(req.body, null, 2));

	// Store the received update
	received_updates.unshift(req.body);

	// Respond to webhook immediately (required by Meta)
	res.sendStatus(200);

	// Process the message asynchronously
	try {
		if (req.body.object === "whatsapp_business_account") {
			for (const entry of req.body.entry) {
				if (entry.changes) {
					for (const change of entry.changes) {
						if (change.value && change.value.messages) {
							for (const message of change.value.messages) {
								// Check if it's an incoming text message
								if (message.type === "text") {
									const senderId = message.from;
									const recipientId = change.value.metadata.phone_number_id;
									const userMessage = message.text.body;

									console.log(`\n📨 New WhatsApp Message:`);
									console.log(`   From: ${senderId}`);
									console.log(`   To: ${recipientId}`);
									console.log(`   Message: "${userMessage}"`);

									// Only process if message is sent TO your account
									console.log(
										`   Checking recipient: ${recipientId} vs ${process.env.WHATSAPP_PHONENUM_ID}`
									);
									if (recipientId === process.env.WHATSAPP_PHONENUM_ID) {
										// Get AI response with conversation context
										const aiResponse = await getOpenAIResponse(
											userMessage,
											senderId,
											null
										);

										// Send reply to WhatsApp (only if access token is configured and valid)
										if (
											process.env.WHATSAPP_ACCOUNT_ACCESS_TOKEN &&
											process.env.WHATSAPP_ACCOUNT_ACCESS_TOKEN !==
												"your_whatsapp_access_token_here" &&
											process.env.WHATSAPP_ACCOUNT_ACCESS_TOKEN.length > 50
										) {
											try {
												console.log(`\n📤 Sending reply to WhatsApp...`);
												await sendWhatsAppMessage(senderId, aiResponse);
												console.log(`✅ Reply sent successfully!\n`);
											} catch (sendError) {
												console.log(`\n❌ Failed to send WhatsApp reply`);
												console.log(
													`💡 Your WhatsApp Access Token may be expired or invalid`
												);
												console.log(
													`   Get a new token from Meta Developer Console\n`
												);
											}
										} else {
											console.log(
												`\n⚠️  WhatsApp Access Token not configured - Response displayed above only`
											);
											console.log(
												`💡 To enable auto-replies, get a valid WhatsApp Access Token from Meta Developer Console\n`
											);
										}
									} else {
										console.log(
											`⚠️  Skipping - message not sent to our account (recipient mismatch)\n`
										);
									}
								}
							}
						}
					}
				}
			}
		}
	} catch (error) {
		console.error("Error processing WhatsApp message:", error);
	}
});

// For local development
if (process.env.NODE_ENV !== 'production') {
	const PORT = app.get("port");
	app.listen(PORT, function () {
		console.log(`Node app is running on port ${PORT}`);
	});
}

// Export for Vercel serverless
module.exports = app;
