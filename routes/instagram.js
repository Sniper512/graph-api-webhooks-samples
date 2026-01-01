const express = require('express');
const axios = require('axios');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const auth = require('../middleware/auth');
const { ensureDBConnection } = require('../utils/db');

const router = express.Router();

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

// Get user's recent Instagram conversations from database
router.get('/conversations', ensureDBConnection, auth, async (req, res) => {
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

    // Format conversations with user profile info
    const formattedConversations = await Promise.all(conversations.map(async (conv) => {
      // Fetch user profile from Instagram API
      const userProfile = await getInstagramUserProfile(conv.senderId, user.instagramAccessToken);

      return {
        id: conv._id,
        userId: conv.senderId,
        username: userProfile.username,
        profilePicture: userProfile.profilePicture
      };
    }));

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
router.get('/conversations/:conversationId/messages', ensureDBConnection, auth, async (req, res) => {
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

// Initiate Instagram connection (user provides username, status becomes pending)
router.post('/initiate-connection', auth, async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({
        message: 'Instagram username is required.'
      });
    }

    // Update user with username and set status to pending
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      {
        'instagramUsername': username.trim(),
        'instagramIntegrationStatus': 'pending'
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({
      message: 'Instagram connection initiated successfully. Admin will contact you for onboarding.',
      user: {
        id: user._id,
        instagramUsername: user.instagramUsername,
        instagramIntegrationStatus: user.instagramIntegrationStatus
      }
    });

  } catch (error) {
    console.error('Initiate Instagram connection error:', error);
    res.status(500).json({
      message: 'Failed to initiate Instagram connection.'
    });
  }
});

// Pause Instagram webhook for user
router.post('/pause-webhook', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    user.instagramWebhookPaused = true;
    await user.save();

    console.log(`⏸️  Instagram webhook paused for user ${user._id}`);

    res.json({
      message: 'Instagram webhook paused successfully.',
      instagramWebhookPaused: true
    });
  } catch (error) {
    console.error('Pause Instagram webhook error:', error);
    res.status(500).json({
      message: 'Failed to pause Instagram webhook.'
    });
  }
});

// Resume Instagram webhook for user
router.post('/resume-webhook', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    user.instagramWebhookPaused = false;
    await user.save();

    console.log(`▶️  Instagram webhook resumed for user ${user._id}`);

    res.json({
      message: 'Instagram webhook resumed successfully.',
      instagramWebhookPaused: false
    });
  } catch (error) {
    console.error('Resume Instagram webhook error:', error);
    res.status(500).json({
      message: 'Failed to resume Instagram webhook.'
    });
  }
});


module.exports = router;