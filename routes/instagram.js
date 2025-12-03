const express = require('express');
const axios = require('axios');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Get user's recent Instagram conversations
router.get('/conversations', auth, async (req, res) => {
  console.log('🔥 INSTAGRAM CONVERSATIONS ENDPOINT HIT!');
  console.log('User ID from token:', req.user?.userId);

  try {
    const user = await User.findById(req.user.userId);
    console.log('User found in DB:', !!user);
    console.log('User instagramAccountId:', user?.instagramAccountId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (!user.instagramAccountId) {
      return res.status(400).json({
        message: 'Instagram account not connected. Please connect your Instagram business account.'
      });
    }

    if (!user.instagramAccessToken) {
      return res.status(400).json({
        message: 'Instagram access token not set. Please set your access token.'
      });
    }

    const INSTAGRAM_ACCESS_TOKEN = user.instagramAccessToken;

    // Fetch conversations from Instagram Graph API
    console.log('📨 Instagram Conversations API Request:', {
      url: `https://graph.instagram.com/v23.0/${user.instagramAccountId}/conversations`,
      params: {
        access_token: INSTAGRAM_ACCESS_TOKEN.substring(0, 50) + '...[TRUNCATED]',
        platform: 'instagram'
      }
    });
    console.log('🔑 Full Access Token (first 100 chars):', INSTAGRAM_ACCESS_TOKEN.substring(0, 100));

    const response = await axios.get(
      `https://graph.instagram.com/v23.0/${user.instagramAccountId}/conversations`,
      {
        params: {
          access_token: INSTAGRAM_ACCESS_TOKEN,
          platform: 'instagram', // Required parameter from docs
          fields: 'id,updated_time,participants' // Try to get participants too
        }
      }
    );

    console.log('📥 Instagram Conversations API Raw Response:', JSON.stringify(response.data, null, 2));

    // Format the response with participants if available
    const conversations = response.data.data.map(conv => ({
      id: conv.id,
      updatedTime: conv.updated_time,
      participants: conv.participants?.data || []
    }));

    // If no participants in conversations, try to get username from recent message
    for (let conv of conversations) {
      if (conv.participants.length === 0) {
        try {
          // Get the most recent message to extract participant info
          const messageResponse = await axios.get(
            `https://graph.instagram.com/v23.0/${conv.id}`,
            {
              params: {
                access_token: INSTAGRAM_ACCESS_TOKEN,
                fields: 'messages.limit(1){from}'
              }
            }
          );

          const recentMessage = messageResponse.data.messages?.data?.[0];
          if (recentMessage?.from) {
            // Add the sender as a participant (they're the customer)
            conv.participants = [recentMessage.from];
          }
        } catch (msgError) {
          console.log(`Could not get participant for conversation ${conv.id}:`, msgError.message);
        }
      }
    }

    const apiResponse = {
      conversations,
      total: conversations.length
    };

    console.log('📤 Instagram Conversations API Response:', JSON.stringify(apiResponse, null, 2));

    res.json(apiResponse);

  } catch (error) {
    console.error('Instagram conversations error:', error.response?.data || error.message);
    res.status(500).json({
      message: 'Failed to fetch Instagram conversations.',
      error: error.response?.data?.error?.message || error.message
    });
  }
});

// Get messages for a specific conversation
router.get('/conversations/:conversationId/messages', auth, async (req, res) => {
  console.log('🔥 INSTAGRAM MESSAGES ENDPOINT HIT!');
  console.log('Conversation ID:', req.params.conversationId);
  console.log('User ID from token:', req.user?.userId);

  // Get limit from query params, default to 10 for faster loading
  const limit = Math.min(parseInt(req.query.limit) || 10, 20); // Max 20 as per Instagram API
  const after = req.query.after; // For pagination
  console.log('Message limit:', limit, 'After cursor:', after);

  try {
    const { conversationId } = req.params;
    const user = await User.findById(req.user.userId);
    console.log('User found in DB:', !!user);
    console.log('User instagramAccountId:', user?.instagramAccountId);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (!user.instagramAccountId) {
      return res.status(400).json({
        message: 'Instagram account not connected.'
      });
    }

    if (!user.instagramAccessToken) {
      return res.status(400).json({
        message: 'Instagram access token not set. Please set your access token.'
      });
    }

    const INSTAGRAM_ACCESS_TOKEN = user.instagramAccessToken;

    // Step 1: Get message IDs from conversation (according to docs)
    const params = {
      access_token: INSTAGRAM_ACCESS_TOKEN,
      fields: 'messages'
    };

    if (after) {
      params.after = after;
    }

    console.log('📨 Instagram Messages API Request:', {
      url: `https://graph.instagram.com/v23.0/${conversationId}`,
      params: {
        ...params,
        access_token: '[HIDDEN]'
      }
    });

    const conversationResponse = await axios.get(
      `https://graph.instagram.com/v23.0/${conversationId}`,
      { params }
    );

    console.log('📥 Instagram Conversation API Raw Response:', JSON.stringify(conversationResponse.data, null, 2));

    // Get the most recent message IDs based on limit
    const messageIds = conversationResponse.data.messages?.data?.slice(0, limit) || [];

    // Step 2: Get details for each message
    const messages = [];
    for (const messageData of messageIds) {
      try {
        console.log(`📨 Getting message details for: ${messageData.id}`);

        const messageResponse = await axios.get(
          `https://graph.instagram.com/v23.0/${messageData.id}`,
          {
            params: {
              access_token: INSTAGRAM_ACCESS_TOKEN,
              fields: 'id,created_time,from,to,message'
            }
          }
        );

        console.log('📥 Message details:', JSON.stringify(messageResponse.data, null, 2));

        messages.push({
          id: messageResponse.data.id,
          message: messageResponse.data.message || '',
          from: messageResponse.data.from,
          to: messageResponse.data.to,
          createdTime: messageResponse.data.created_time
        });
      } catch (msgError) {
        console.log(`❌ Failed to get message ${messageData.id}:`, msgError.response?.data);
        // Continue with other messages
      }
    }

    const apiResponse = {
      conversationId,
      messages,
      total: messages.length,
      pagination: conversationResponse.data.messages?.paging || null
    };

    console.log('📤 Instagram Messages API Response:', JSON.stringify(apiResponse, null, 2));

    res.json(apiResponse);

  } catch (error) {
    console.error('Instagram messages error:', error.response?.data || error.message);
    res.status(500).json({
      message: 'Failed to fetch conversation messages.',
      error: error.response?.data?.error?.message || error.message
    });
  }
});

// Update user's Instagram account ID
router.post('/connect-account', auth, async (req, res) => {
  try {
    const { instagramAccountId } = req.body;

    if (!instagramAccountId) {
      return res.status(400).json({
        message: 'Instagram account ID is required.'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { instagramAccountId: instagramAccountId.trim() },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({
      message: 'Instagram account connected successfully.',
      user: {
        id: user._id,
        instagramAccountId: user.instagramAccountId
      }
    });

  } catch (error) {
    console.error('Connect Instagram account error:', error);
    res.status(500).json({
      message: 'Failed to connect Instagram account.'
    });
  }
});

// Set user's Instagram access token
router.post('/set-access-token', auth, async (req, res) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        message: 'Instagram access token is required.'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { instagramAccessToken: accessToken.trim() },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({
      message: 'Instagram access token set successfully.',
      user: {
        id: user._id,
        instagramAccountId: user.instagramAccountId
      }
    });

  } catch (error) {
    console.error('Set Instagram access token error:', error);
    res.status(500).json({
      message: 'Failed to set Instagram access token.'
    });
  }
});

module.exports = router;