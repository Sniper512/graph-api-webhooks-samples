const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Signup endpoint
router.post('/signup', async (req, res) => {
  try {
    const { fullName, businessName, email, password, termsAccepted } = req.body;

    // Validation
    if (!fullName || !businessName || !email || !password || termsAccepted === undefined) {
      return res.status(400).json({
        message: 'All fields are required including terms acceptance.'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters long.'
      });
    }

    if (!termsAccepted) {
      return res.status(400).json({
        message: 'You must accept the terms and conditions.'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        message: 'User with this email already exists.'
      });
    }

    // Create new user
    const user = new User({
      fullName: fullName.trim(),
      businessName: businessName.trim(),
      email: email.toLowerCase().trim(),
      password,
      termsAccepted
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET || 'your_jwt_secret_key',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User created successfully.',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        businessName: user.businessName,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      message: 'Internal server error during signup.'
    });
  }
});

// Signin endpoint
router.post('/signin', async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required.'
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({
        message: 'Invalid email or password.'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Invalid email or password.'
      });
    }

    // Generate JWT token
    const expiresIn = rememberMe ? '30d' : '7d';
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET || 'your_jwt_secret_key',
      { expiresIn }
    );

    res.json({
      message: 'Signin successful.',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        businessName: user.businessName,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({
      message: 'Internal server error during signin.'
    });
  }
});

// Get current user profile (protected route)
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({
      user: {
        id: user._id,
        fullName: user.fullName,
        businessName: user.businessName,
        email: user.email,
        termsAccepted: user.termsAccepted,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({
      message: 'Internal server error.'
    });
  }
});

module.exports = router;