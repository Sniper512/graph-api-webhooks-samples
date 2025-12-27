const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');
const { google } = require('googleapis');
const auth = require('../middleware/auth');

// Initialize Google OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CALENDAR_CLIENT_ID,
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
  process.env.GOOGLE_CALENDAR_REDIRECT_URI
);

// Helper function to refresh access token if expired
async function refreshAccessTokenIfNeeded(user) {
  const now = new Date();
  if (user.googleCalendarTokenExpiry && user.googleCalendarTokenExpiry <= now) {
    console.log('🔄 Refreshing Google Calendar access token...');
    try {
      oauth2Client.setCredentials({
        refresh_token: user.googleCalendarRefreshToken
      });
      const { credentials } = await oauth2Client.refreshAccessToken();
      user.googleCalendarAccessToken = credentials.access_token;
      user.googleCalendarTokenExpiry = new Date(credentials.expiry_date);
      await user.save();
      console.log('✅ Access token refreshed successfully');
    } catch (error) {
      console.error('❌ Failed to refresh access token:', error);
      // Mark integration as disconnected if refresh fails
      user.googleCalendarIntegrationStatus = 'disconnected';
      user.googleCalendarAccessToken = null;
      user.googleCalendarRefreshToken = null;
      user.googleCalendarTokenExpiry = null;
      await user.save();
      console.log('✅ User calendar integration status updated to disconnected');
      throw new Error('Google Calendar authentication expired. Please reconnect.');
    }
  }
  return user.googleCalendarAccessToken;
}

// Route to initiate Google Calendar OAuth flow
router.get('/auth/google', auth, (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email'
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    state: req.user.userId // Pass the user ID in the state parameter
  });

  res.redirect(url);
});

// Callback route to handle Google OAuth response
router.get('/auth/google/callback', async (req, res) => {
  const { code, state } = req.query;

  try {
    console.log('🔄 Google OAuth Callback: Exchanging code for tokens...');
    
    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    console.log('✅ Google OAuth Callback: Tokens exchanged successfully');
    
    // Extract user ID from the state parameter
    const userId = state;
    
    if (!userId) {
      console.log('❌ Google OAuth Callback: User ID not found in state');
      return res.status(400).send('User ID not found in state');
    }
    
    console.log('🔄 Google OAuth Callback: Finding user by ID...');
    
    // Find the user by ID and save the tokens
    const user = await User.findById(userId);
    
    if (!user) {
      console.log('❌ Google OAuth Callback: User not found');
      return res.status(404).send('User not found');
    }
    
    console.log('✅ Google OAuth Callback: User found:', user.email);
    
    console.log('🔄 Google OAuth Callback: Saving tokens to user record...');
    
    user.googleCalendarAccessToken = tokens.access_token;
    user.googleCalendarRefreshToken = tokens.refresh_token;
    user.googleCalendarTokenExpiry = new Date(tokens.expiry_date);
    user.googleCalendarIntegrationStatus = 'connected';
    
    await user.save();
    
    console.log('✅ Google OAuth Callback: Tokens saved to user record');
    
    // Redirect the user to the bookings page
    console.log('🔄 Google OAuth Callback: Redirecting to bookings page...');
    res.redirect('http://localhost:5173/bookings?googleCalendar=connected');
  } catch (error) {
    console.error('❌ Google OAuth Callback Error:', error);
    res.status(500).send('Failed to authenticate with Google Calendar');
  }
});

// Route to check Google Calendar integration status
router.get('/status', auth, async (req, res) => {
  try {
    const userId = req.user.userId; // Extract userId from the authenticated user
    if (!userId) {
      console.log('❌ Google Calendar Status: User not authenticated');
      return res.status(401).send('User not authenticated');
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log('❌ Google Calendar Status: User not found');
      return res.status(404).send('User not found');
    }

    console.log('✅ Google Calendar Status: Integration status retrieved successfully');
    
    res.json({
      status: user.googleCalendarIntegrationStatus,
      isConnected: user.googleCalendarIntegrationStatus === 'connected'
    });
  } catch (error) {
    console.error('❌ Google Calendar Status Error:', error);
    res.status(500).send('Failed to fetch Google Calendar status');
  }
});

// Route to fetch calendar events
router.get('/events', auth, async (req, res) => {
 try {
   const userId = req.user.userId;
   const user = await User.findById(userId);
   if (!user || user.googleCalendarIntegrationStatus !== 'connected') {
     return res.status(400).json({ message: 'Google Calendar not connected' });
   }

   // Refresh token if needed
   const accessToken = await refreshAccessTokenIfNeeded(user);

   // Set credentials
   oauth2Client.setCredentials({ access_token: accessToken });

   // Get calendar API
   const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

   // Get query params
   const timeMin = req.query.timeMin || new Date().toISOString();
   const timeMax = req.query.timeMax;
   const maxResults = parseInt(req.query.maxResults) || 250;

   // Fetch events
   const response = await calendar.events.list({
     calendarId: 'primary',
     timeMin,
     timeMax,
     maxResults,
     singleEvents: true,
     orderBy: 'startTime'
   });

   // Structure the events
   const events = response.data.items.map(event => ({
     id: event.id,
     summary: event.summary,
     description: event.description,
     start: event.start,
     end: event.end,
     status: event.status,
     location: event.location,
     attendees: event.attendees,
     created: event.created,
     updated: event.updated
   }));

   res.json({ events });
 } catch (error) {
   console.error('❌ Fetch Events Error:', error);
   res.status(500).json({ message: 'Failed to fetch calendar events' });
 }
});

// Route to fetch bookings only
router.get('/bookings', auth, async (req, res) => {
  const userId = req.user.userId; // Declare userId outside try block
  try {
    const user = await User.findById(userId);
    if (!user || user.googleCalendarIntegrationStatus !== 'connected') {
      return res.status(400).json({ message: 'Google Calendar not connected' });
    }

    // Refresh token if needed
    const accessToken = await refreshAccessTokenIfNeeded(user);

    // Set credentials
    oauth2Client.setCredentials({ access_token: accessToken });

    // Get calendar API
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Get query params
    const timeMin = req.query.timeMin || new Date().toISOString();
    const timeMax = req.query.timeMax;
    const maxResults = parseInt(req.query.maxResults) || 250;

    // Fetch events
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      maxResults,
      singleEvents: true,
      orderBy: 'startTime'
    });

    // Filter bookings: events where summary or description contains 'booking' (case insensitive)
    const bookings = response.data.items
      .filter(event => {
        const summary = (event.summary || '').toLowerCase();
        const description = (event.description || '').toLowerCase();
        return summary.includes('booking') || description.includes('booking');
      })
      .map(event => ({
        id: event.id,
        summary: event.summary,
        description: event.description,
        start: event.start,
        end: event.end,
        status: event.status,
        location: event.location,
        attendees: event.attendees,
        created: event.created,
        updated: event.updated
      }));

    console.log(`📅 Bookings fetched for user ${userId}: ${bookings.length} bookings`);
    if (bookings.length > 0) {
      console.log('📝 First booking details:', bookings[0]);
      console.log('👥 First booking attendees:', bookings[0].attendees);
    }

    res.json({ bookings });
  } catch (error) {
    console.error('❌ Fetch Bookings Error:', error);

    // Check if it's an authentication error (401 Unauthorized)
    if (error.code === 401 || error.status === 401 || (error.response && error.response.status === 401)) {
      console.log('🔐 Authentication error detected - updating user calendar status to disconnected');

      try {
        // Update user's Google Calendar integration status to disconnected
        await User.findByIdAndUpdate(userId, {
          googleCalendarIntegrationStatus: 'disconnected',
          googleCalendarAccessToken: null,
          googleCalendarRefreshToken: null,
          googleCalendarTokenExpiry: null
        });
        console.log('✅ User calendar integration status updated to disconnected');
      } catch (updateError) {
        console.error('❌ Failed to update user calendar status:', updateError);
      }

      return res.status(401).json({
        message: 'Google Calendar authentication expired. Please reconnect your Google Calendar.',
        code: 'AUTH_EXPIRED'
      });
    }

    res.status(500).json({ message: 'Failed to fetch bookings' });
  }
});

// Route to get user bookings from database
router.get('/user-bookings', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const Booking = require('../models/Booking');

    const bookings = await Booking.find({
      userId,
      status: 'active'
    })
    .populate('conversationId', 'senderId platform')
    .sort({ createdAt: -1 })
    .limit(50); // Limit to prevent large responses

    console.log(`📋 Retrieved ${bookings.length} bookings for user ${userId}`);

    res.json({
      bookings: bookings.map(booking => ({
        id: booking._id,
        eventId: booking.eventId,
        conversationId: booking.conversationId._id,
        senderId: booking.senderId,
        platform: booking.platform,
        summary: booking.summary,
        description: booking.description,
        start: booking.start,
        end: booking.end,
        attendees: booking.attendees,
        createdAt: booking.createdAt
      }))
    });
  } catch (error) {
    console.error('❌ Error fetching user bookings:', error);
    res.status(500).json({ message: 'Failed to fetch bookings' });
  }
});

// Route to create a calendar event
router.post('/events', auth, async (req, res) => {
 console.log('📅 API: Creating calendar event via endpoint');
 try {
   const userId = req.user.userId;
   console.log(`👤 API: Processing for user ${userId}`);
   const user = await User.findById(userId);
   if (!user || user.googleCalendarIntegrationStatus !== 'connected') {
     console.log('❌ API: Google Calendar not connected');
     return res.status(400).json({ message: 'Google Calendar not connected' });
   }
   console.log('✅ API: User has Google Calendar connected');
   // Refresh token if needed
   const accessToken = await refreshAccessTokenIfNeeded(user);
   console.log('🔧 API: Setting OAuth credentials');
   // Set credentials
   oauth2Client.setCredentials({ access_token: accessToken });
   // Get calendar API
   const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
   console.log('📅 API: Calendar API initialized');
   // Get event data from request body
   const { summary, description, start, end, location, attendees } = req.body;
   console.log(`📝 API: Event details - Summary: "${summary}", Start: ${start}, End: ${end}`);
   if (!summary || !start || !end) {
     console.log('❌ API: Missing required fields');
     return res.status(400).json({ message: 'Summary, start, and end are required' });
   }
   // Create event
   const event = {
     summary,
     description,
     start,
     end,
     location,
     attendees
   };
   console.log('📅 API: Inserting event into Google Calendar...');
   const response = await calendar.events.insert({
     calendarId: 'primary',
     resource: event
   });
   console.log(`✅ API: Event created successfully with ID ${response.data.id}`);
   // Return created event
   const createdEvent = {
     id: response.data.id,
     summary: response.data.summary,
     description: response.data.description,
     start: response.data.start,
     end: response.data.end,
     status: response.data.status,
     location: response.data.location,
     attendees: response.data.attendees,
     created: response.data.created,
     updated: response.data.updated
   };
   res.status(201).json({ event: createdEvent });
 } catch (error) {
   console.error('❌ API: Create Event Error:', error);
   res.status(500).json({ message: 'Failed to create calendar event' });
 }
});

module.exports = router;