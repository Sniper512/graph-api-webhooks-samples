const express = require('express');
const FAQ = require('../models/FAQ');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all FAQs for the authenticated user
router.get('/', auth, async (req, res) => {
  try {
    const faqs = await FAQ.find({ user: req.user.userId }).sort({ createdAt: -1 });

    res.json({
      faqs,
      total: faqs.length
    });
  } catch (error) {
    console.error('Get FAQs error:', error);
    res.status(500).json({
      message: 'Failed to fetch FAQs.'
    });
  }
});

// Get a specific FAQ
router.get('/:id', auth, async (req, res) => {
  try {
    const faq = await FAQ.findOne({
      _id: req.params.id,
      user: req.user.userId
    });

    if (!faq) {
      return res.status(404).json({ message: 'FAQ not found.' });
    }

    res.json({ faq });
  } catch (error) {
    console.error('Get FAQ error:', error);
    res.status(500).json({
      message: 'Failed to fetch FAQ.'
    });
  }
});

// Create a new FAQ
router.post('/', auth, async (req, res) => {
  try {
    const { question, answer } = req.body;

    if (!question || !answer) {
      return res.status(400).json({
        message: 'Question and answer are required.'
      });
    }

    const faq = new FAQ({
      question: question.trim(),
      answer: answer.trim(),
      user: req.user.userId
    });

    await faq.save();

    res.status(201).json({
      message: 'FAQ created successfully.',
      faq
    });
  } catch (error) {
    console.error('Create FAQ error:', error);
    res.status(500).json({
      message: 'Failed to create FAQ.'
    });
  }
});

// Update a specific FAQ
router.put('/:id', auth, async (req, res) => {
  try {
    const { question, answer } = req.body;

    if (!question || !answer) {
      return res.status(400).json({
        message: 'Question and answer are required.'
      });
    }

    const faq = await FAQ.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user.userId
      },
      {
        question: question.trim(),
        answer: answer.trim()
      },
      { new: true }
    );

    if (!faq) {
      return res.status(404).json({ message: 'FAQ not found.' });
    }

    res.json({
      message: 'FAQ updated successfully.',
      faq
    });
  } catch (error) {
    console.error('Update FAQ error:', error);
    res.status(500).json({
      message: 'Failed to update FAQ.'
    });
  }
});

// Delete a specific FAQ
router.delete('/:id', auth, async (req, res) => {
  try {
    const faq = await FAQ.findOneAndDelete({
      _id: req.params.id,
      user: req.user.userId
    });

    if (!faq) {
      return res.status(404).json({ message: 'FAQ not found.' });
    }

    res.json({
      message: 'FAQ deleted successfully.'
    });
  } catch (error) {
    console.error('Delete FAQ error:', error);
    res.status(500).json({
      message: 'Failed to delete FAQ.'
    });
  }
});

module.exports = router;