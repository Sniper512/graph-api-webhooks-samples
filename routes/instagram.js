const express = require('express');
const axios = require('axios');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const auth = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/encryption');

const router = express.Router();

// Get user's recent Instagram conversations from database
router.get('/conversations', auth, async (req, res) => {
  console.log('🔥 INSTAGRAM CONVERSATIONS ENDPOINT HIT!');
  console.log('User ID from token:', req.user?.userId);

  try {
    const user = await User.findById(req.user.userId);
    console.log('User found in DB:', !!user);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Fetch conversations from database instead of Instagram API
    const conversations = await Conversation.find({
      userId: user._id,
      platform: 'instagram',
      isActive: true
    })
    .sort({ lastMessageAt: -1 })
    .select('senderId messages lastMessageAt createdAt')
    .lean();

    // Format conversations with last message preview
    const formattedConversations = conversations.map(conv => {
      const lastMessage = conv.messages[conv.messages.length - 1];
      const messageCount = conv.messages.length;
      
      return {
        id: conv._id,
        senderId: conv.senderId,
        lastMessage: lastMessage ? {
          content: lastMessage.content,
          role: lastMessage.role,
          timestamp: lastMessage.timestamp
        } : null,
        messageCount,
        lastMessageAt: conv.lastMessageAt,
        createdAt: conv.createdAt
      };
    });

    const apiResponse = {
      conversations: formattedConversations,
      total: formattedConversations.length
    };

    console.log('📤 Instagram Conversations from DB:', JSON.stringify(apiResponse, null, 2));

    res.json(apiResponse);

  } catch (error) {
    console.error('Instagram conversations error:', error.message);
    res.status(500).json({
      message: 'Failed to fetch Instagram conversations.',
      error: error.message
    });
  }
});

// Get messages for a specific conversation from database
router.get('/conversations/:conversationId/messages', auth, async (req, res) => {
  console.log('🔥 INSTAGRAM MESSAGES ENDPOINT HIT!');
  console.log('Conversation ID:', req.params.conversationId);
  console.log('User ID from token:', req.user?.userId);

  try {
    const { conversationId } = req.params;
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Fetch conversation from database
    const conversation = await Conversation.findOne({
      _id: conversationId,
      userId: user._id,
      platform: 'instagram'
    }).lean();

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }

    // Format messages
    const messages = conversation.messages.map(msg => ({
      id: msg._id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp
    }));

    const apiResponse = {
      conversationId,
      senderId: conversation.senderId,
      messages,
      total: messages.length,
      lastMessageAt: conversation.lastMessageAt
    };

    console.log('📤 Instagram Messages from DB:', JSON.stringify(apiResponse, null, 2));

    res.json(apiResponse);

  } catch (error) {
    console.error('Instagram messages error:', error.message);
    res.status(500).json({
      message: 'Failed to fetch conversation messages.',
      error: error.message
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

    // Check if both account ID and access token are set, update status to connected
    let integrationStatus = user.instagramIntegrationStatus;
    if (user.instagramAccessToken && user.instagramAccountId) {
      integrationStatus = 'connected';
      await User.findByIdAndUpdate(req.user.userId, { instagramIntegrationStatus: 'connected' });
    }

    res.json({
      message: 'Instagram account connected successfully.',
      user: {
        id: user._id,
        instagramAccountId: user.instagramAccountId,
        instagramIntegrationStatus: integrationStatus
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

    // Check if both account ID and access token are set, update status to connected
    let integrationStatus = user.instagramIntegrationStatus;
    if (user.instagramAccessToken && user.instagramAccountId) {
      integrationStatus = 'connected';
      await User.findByIdAndUpdate(req.user.userId, { instagramIntegrationStatus: 'connected' });
    }

    res.json({
      message: 'Instagram access token set successfully.',
      user: {
        id: user._id,
        instagramAccountId: user.instagramAccountId,
        instagramIntegrationStatus: integrationStatus
      }
    });

  } catch (error) {
    console.error('Set Instagram access token error:', error);
    res.status(500).json({
      message: 'Failed to set Instagram access token.'
    });
  }
});

// Set user's Instagram credentials (email, username, password)
router.post('/set-credentials', auth, async (req, res) => {
  try {
    const { email, username, password } = req.body;

    if (!email && !username) {
      return res.status(400).json({
        message: 'Either email or username is required.'
      });
    }

    if (!password) {
      return res.status(400).json({
        message: 'Password is required.'
      });
    }

    // Encrypt the password using master key
    const { encryptedData, iv } = encrypt(password);

    // Update user with encrypted credentials and set status to pending
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      {
        'instagramCredentials.email': email?.trim().toLowerCase(),
        'instagramCredentials.username': username?.trim(),
        'instagramCredentials.encryptedData': encryptedData,
        'instagramCredentials.iv': iv,
        instagramIntegrationStatus: 'pending'
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({
      message: 'Instagram credentials set successfully.',
      user: {
        id: user._id,
        instagramCredentials: {
          email: user.instagramCredentials.email,
          username: user.instagramCredentials.username
        },
        instagramIntegrationStatus: user.instagramIntegrationStatus
      }
    });

  } catch (error) {
    console.error('Set Instagram credentials error:', error);
    res.status(500).json({
      message: 'Failed to set Instagram credentials.'
    });
  }
});

// Get user's Instagram credentials (for admin panel)
router.get('/credentials', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('instagramCredentials');

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (!user.instagramCredentials?.encryptedData) {
      return res.status(404).json({ message: 'Instagram credentials not found.' });
    }

    // Decrypt the password using master key
    const decryptedPassword = decrypt(
      user.instagramCredentials.encryptedData,
      user.instagramCredentials.iv
    );

    res.json({
      instagramCredentials: {
        email: user.instagramCredentials.email,
        username: user.instagramCredentials.username,
        password: decryptedPassword
      }
    });

  } catch (error) {
    console.error('Get Instagram credentials error:', error);
    res.status(500).json({
      message: 'Failed to retrieve Instagram credentials.'
    });
  }
});

module.exports = router;