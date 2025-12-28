const express = require('express');
const Business = require('../models/Business');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Create business information
router.post('/', auth, async (req, res) => {
  try {
    const {
      businessName,
      businessCategory,
      email,
      phoneNumber,
      website,
      businessDescription,
      address,
      timezone
    } = req.body;

    // Validation
    if (!businessName || !businessCategory || !email) {
      return res.status(400).json({
        message: 'Business name, category, and email are required.'
      });
    }

    // Check if user already has business info
    const existingBusiness = await Business.findOne({ user: req.user.userId });
    if (existingBusiness) {
      return res.status(409).json({
        message: 'Business information already exists for this user.'
      });
    }

    // Check if email is already used by another business
    const existingEmail = await Business.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(409).json({
        message: 'Email is already associated with another business.'
      });
    }

    // Create business
    const business = new Business({
      user: req.user.userId,
      businessName: businessName.trim(),
      businessCategory: businessCategory.trim(),
      email: email.toLowerCase().trim(),
      phoneNumber: phoneNumber?.trim(),
      website: website?.trim(),
      businessDescription: businessDescription?.trim(),
      address: address?.trim(),
      timezone: timezone?.trim() || 'UTC'
    });

    await business.save();

    // Update user with business reference
    await User.findByIdAndUpdate(req.user.userId, { business: business._id });

    res.status(201).json({
      message: 'Business information created successfully.',
      business: {
        id: business._id,
        businessName: business.businessName,
        businessCategory: business.businessCategory,
        email: business.email,
        phoneNumber: business.phoneNumber,
        website: business.website,
        businessDescription: business.businessDescription,
        address: business.address,
        timezone: business.timezone,
        createdAt: business.createdAt,
        updatedAt: business.updatedAt
      }
    });

  } catch (error) {
    console.error('Create business error:', error);
    res.status(500).json({
      message: 'Internal server error during business creation.'
    });
  }
});

// Get business information
router.get('/', auth, async (req, res) => {
  try {
    const business = await Business.findOne({ user: req.user.userId });

    if (!business) {
      return res.status(404).json({
        message: 'Business information not found.'
      });
    }

    res.json({
      business: {
        id: business._id,
        businessName: business.businessName,
        businessCategory: business.businessCategory,
        email: business.email,
        phoneNumber: business.phoneNumber,
        website: business.website,
        businessDescription: business.businessDescription,
        address: business.address,
        timezone: business.timezone,
        createdAt: business.createdAt,
        updatedAt: business.updatedAt
      }
    });

  } catch (error) {
    console.error('Get business error:', error);
    res.status(500).json({
      message: 'Internal server error.'
    });
  }
});

// Update business information
router.put('/', auth, async (req, res) => {
  try {
    const {
      businessName,
      businessCategory,
      email,
      phoneNumber,
      website,
      businessDescription,
      address,
      timezone
    } = req.body;

    // Validation
    if (!businessName || !businessCategory || !email) {
      return res.status(400).json({
        message: 'Business name, category, and email are required.'
      });
    }

    // Find existing business
    const business = await Business.findOne({ user: req.user.userId });
    if (!business) {
      return res.status(404).json({
        message: 'Business information not found.'
      });
    }

    // Check if email is already used by another business (excluding current)
    if (email.toLowerCase() !== business.email) {
      const existingEmail = await Business.findOne({
        email: email.toLowerCase(),
        user: { $ne: req.user.userId }
      });
      if (existingEmail) {
        return res.status(409).json({
          message: 'Email is already associated with another business.'
        });
      }
    }

    // Update business
    business.businessName = businessName.trim();
    business.businessCategory = businessCategory.trim();
    business.email = email.toLowerCase().trim();
    business.phoneNumber = phoneNumber?.trim() || '';
    business.website = website?.trim() || '';
    business.businessDescription = businessDescription?.trim() || '';
    business.address = address?.trim() || '';
    business.timezone = timezone?.trim() || 'UTC';

    await business.save();

    res.json({
      message: 'Business information updated successfully.',
      business: {
        id: business._id,
        businessName: business.businessName,
        businessCategory: business.businessCategory,
        email: business.email,
        phoneNumber: business.phoneNumber,
        website: business.website,
        businessDescription: business.businessDescription,
        address: business.address,
        timezone: business.timezone,
        createdAt: business.createdAt,
        updatedAt: business.updatedAt
      }
    });

  } catch (error) {
    console.error('Update business error:', error);
    res.status(500).json({
      message: 'Internal server error during business update.'
    });
  }
});

// Delete business information
router.delete('/', auth, async (req, res) => {
  try {
    const business = await Business.findOneAndDelete({ user: req.user.userId });

    if (!business) {
      return res.status(404).json({
        message: 'Business information not found.'
      });
    }

    // Remove business reference from user
    await User.findByIdAndUpdate(req.user.userId, { $unset: { business: 1 } });

    res.json({
      message: 'Business information deleted successfully.'
    });

  } catch (error) {
    console.error('Delete business error:', error);
    res.status(500).json({
      message: 'Internal server error during business deletion.'
    });
  }
});

module.exports = router;