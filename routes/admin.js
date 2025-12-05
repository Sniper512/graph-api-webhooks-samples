const express = require('express');
const User = require('../models/User');
const Business = require('../models/Business');
const FAQ = require('../models/FAQ');

const router = express.Router();

// Admin API key middleware (simple authentication for admin panel)
const adminAuth = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  
  // In production, use a secure admin key from environment variables
  const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin-secret-key-change-in-production';
  
  if (!adminKey || adminKey !== ADMIN_SECRET) {
    return res.status(401).json({ message: 'Unauthorized. Invalid admin key.' });
  }
  
  next();
};

// Get all users with their integration status
router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -instagramAccessToken')
      .populate('business')
      .sort({ createdAt: -1 });

    const formattedUsers = users.map(user => ({
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      businessName: user.businessName,
      businessCategory: user.business?.businessCategory || 'Not Set',
      plan: 'Pro', // Default plan - can be extended with subscription system
      status: 'Active', // Default status - can be extended
      instagramIntegrationStatus: user.instagramIntegrationStatus,
      instagramAccountId: user.instagramAccountId || null,
      instagramUsername: user.instagramUsername || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }));

    res.json({
      users: formattedUsers,
      total: formattedUsers.length
    });

  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({ message: 'Failed to fetch users.' });
  }
});

// Get single user details with Instagram credentials (decrypted)
router.get('/users/:userId', adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId)
      .select('-password')
      .populate('business');

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Get Instagram username
    const instagramUsername = user.instagramUsername || null;

    // Get user's FAQs
    const faqs = await FAQ.find({ user: userId }).sort({ createdAt: -1 });

    // Generate webhook URL
    const webhookUrl = `https://${process.env.NGROK_DOMAIN || 'your-domain.ngrok-free.dev'}/instagram`;

    res.json({
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        businessName: user.businessName,
        termsAccepted: user.termsAccepted,
        instagramAccountId: user.instagramAccountId,
        instagramIntegrationStatus: user.instagramIntegrationStatus,
        instagramUsername,
        instagramAppConfig: user.instagramAppConfig || null,
        hasAccessToken: !!user.instagramAccessToken,
        business: user.business ? {
          id: user.business._id,
          businessName: user.business.businessName,
          businessCategory: user.business.businessCategory,
          email: user.business.email,
          phoneNumber: user.business.phoneNumber,
          website: user.business.website,
          businessDescription: user.business.businessDescription,
          address: user.business.address
        } : null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      faqs: faqs.map(faq => ({
        id: faq._id,
        question: faq.question,
        answer: faq.answer
      })),
      webhookUrl,
      faqCount: faqs.length
    });

  } catch (error) {
    console.error('Admin get user details error:', error);
    res.status(500).json({ message: 'Failed to fetch user details.' });
  }
});

// Set Instagram account ID and access token for a user
router.post('/users/:userId/instagram-config', adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { instagramAccountId, instagramAccessToken, appName, appId, appSecret } = req.body;

    const updateData = {};
    if (instagramAccountId) {
      updateData.instagramAccountId = instagramAccountId.trim();
    }
    if (instagramAccessToken) {
      updateData.instagramAccessToken = instagramAccessToken.trim();
    }
    if (appName) {
      updateData['instagramAppConfig.appName'] = appName.trim();
    }
    if (appId) {
      updateData['instagramAppConfig.appId'] = appId.trim();
    }
    if (appSecret) {
      updateData['instagramAppConfig.appSecret'] = appSecret.trim();
    }

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Update integration status if both account ID and access token are now set
    if (user.instagramAccountId && user.instagramAccessToken) {
      await User.findByIdAndUpdate(userId, { instagramIntegrationStatus: 'connected' });
    }

    res.json({
      message: 'Instagram configuration updated successfully.',
      user: {
        id: user._id,
        instagramAccountId: user.instagramAccountId,
        instagramIntegrationStatus: user.instagramAccountId && user.instagramAccessToken ? 'connected' : user.instagramIntegrationStatus,
        hasAccessToken: !!user.instagramAccessToken
      }
    });

  } catch (error) {
    console.error('Admin set Instagram config error:', error);
    res.status(500).json({ message: 'Failed to update Instagram configuration.' });
  }
});

// Get webhook URL and verification token
router.get('/webhook-info', adminAuth, async (req, res) => {
  try {
    const webhookUrl = `https://${process.env.NGROK_DOMAIN || 'your-domain.ngrok-free.dev'}/instagram`;
    const verifyToken = process.env.TOKEN || 'token';

    res.json({
      webhookUrl,
      verifyToken,
      callbackUrl: webhookUrl,
      note: 'Use these values when setting up the Instagram webhook in Meta Developer Console'
    });

  } catch (error) {
    console.error('Admin get webhook info error:', error);
    res.status(500).json({ message: 'Failed to get webhook info.' });
  }
});

// Get dashboard statistics
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const pendingIntegrations = await User.countDocuments({ instagramIntegrationStatus: 'pending' });
    const connectedIntegrations = await User.countDocuments({ instagramIntegrationStatus: 'connected' });
    const totalFaqs = await FAQ.countDocuments();
    const totalBusinesses = await Business.countDocuments();

    res.json({
      totalUsers,
      pendingIntegrations,
      connectedIntegrations,
      totalFaqs,
      totalBusinesses
    });

  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ message: 'Failed to fetch statistics.' });
  }
});

module.exports = router;
