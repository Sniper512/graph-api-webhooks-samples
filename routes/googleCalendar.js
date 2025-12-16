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
      throw new Error('Failed to refresh access token');
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

module.exports = router;