const express = require('express');
const FAQ = require('../models/FAQ');
const Business = require('../models/Business');
const auth = require('../middleware/auth');
const axios = require('axios');

const router = express.Router();

// Get FAQ extraction status for authenticated user
router.get('/extraction-status', auth, async (req, res) => {
  console.log('🔍 FAQ EXTRACTION STATUS CHECK ENDPOINT HIT!');
  console.log('User ID:', req.user.userId);
  
  try {
    const business = await Business.findOne({ user: req.user.userId });

    if (!business) {
      console.log('❌ Business not found for user:', req.user.userId);
      return res.status(404).json({
        message: 'Business information not found.',
        status: null
      });
    }

    const status = business.faqExtractionStatus || 'idle';
    const updatedAt = business.faqExtractionUpdatedAt;
    const taskId = business.faqExtractionTaskId;

    console.log(`✅ Retrieved status "${status}" for user ${req.user.userId}`);
    
    res.json({
      status: status,
      updatedAt: updatedAt,
      taskId: taskId,
      message: status === 'idle' ? 'No extraction in progress' : `Current status: ${status}`
    });

  } catch (error) {
    console.error('Get FAQ extraction status error:', error);
    res.status(500).json({
      message: 'Failed to retrieve FAQ extraction status.',
      error: error.message,
      status: null
    });
  }
});

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

// Extract FAQs from user's website
router.post('/extract', auth, async (req, res) => {
  try {
    // Check if user has business information with website
    const business = await Business.findOne({ user: req.user.userId });

    if (!business || !business.website) {
      return res.status(400).json({
        message: 'Please add your business website in your business information before extracting FAQs.'
      });
    }

    // Send request to FAQ extraction service with userid
    const faqScraperUrl = process.env.FAQ_SCRAPER_URL || 'http://localhost:5001';
    const response = await axios.post(`${faqScraperUrl}/extract_faqs`, {
      url: business.website,
      userid: req.user.userId,
      max_pages:10,
      max_depth:3
    });

    // Check if response contains "okay" status
    if (response.data && (response.data.status === 'okay' || response.data.toLowerCase() === 'okay')) {
      res.json({
        message: 'Your FAQs will be added automatically in 5 to 10 minutes.'
      });
    } else {
      res.status(500).json({
        message: 'Failed to initiate FAQ extraction. Please try again later.'
      });
    }
  } catch (error) {
    console.error('Extract FAQ error:', error);
    if (error.code === 'ECONNREFUSED') {
      res.status(503).json({
        message: 'FAQ extraction service is currently unavailable. Please try again later.'
      });
    } else {
      res.status(500).json({
        message: 'Failed to extract FAQs from your website.'
      });
    }
  }
});

// Debug endpoint to test 5001 service connection
router.post('/test-push', (req, res) => {
  console.log('🧪 TEST ENDPOINT HIT!');
  console.log('Request body:', req.body);
  console.log('Headers:', req.headers);
  res.json({
    message: 'Test endpoint working!',
    receivedData: req.body,
    timestamp: new Date().toISOString()
  });
});

// Push extracted FAQs to database (for FAQ extraction service)
router.post('/push-extracted', async (req, res) => {
  console.log('📤 PUSH EXTRACTED ENDPOINT HIT!');
  console.log('Request body keys:', Object.keys(req.body));
  console.log('Request headers:', req.headers);
  
  try {
    const { userId, faqs } = req.body;

    if (!userId || !faqs || !Array.isArray(faqs)) {
      console.log('❌ Missing required fields:', { userId: !!userId, faqs: !!faqs, isArray: Array.isArray(faqs) });
      return res.status(400).json({
        message: 'userId and faqs array are required.',
        received: { userId, faqs, faqsType: typeof faqs }
      });
    }

    console.log(`✅ Processing ${faqs.length} FAQs for user ${userId}`);
    
    const savedFaqs = [];
    const errors = [];

    // Process each FAQ
    for (const faqData of faqs) {
      try {
        const { question, answer } = faqData;

        if (!question || !answer) {
          errors.push({
            faq: faqData,
            error: 'Question and answer are required.'
          });
          continue;
        }

        const faq = new FAQ({
          question: question.trim(),
          answer: answer.trim(),
          user: userId
        });

        await faq.save();
        savedFaqs.push(faq);
      } catch (error) {
        console.error('Error saving individual FAQ:', error);
        errors.push({
          faq: faqData,
          error: error.message
        });
      }
    }

    console.log(`✅ Successfully saved ${savedFaqs.length} FAQs, ${errors.length} errors`);
    
    res.json({
      message: `Successfully processed ${savedFaqs.length} FAQs.`,
      savedCount: savedFaqs.length,
      errorCount: errors.length,
      savedFaqs: savedFaqs,
      errors: errors
    });

  } catch (error) {
    console.error('Push extracted FAQs error:', error);
    res.status(500).json({
      message: 'Failed to process extracted FAQs.',
      error: error.message
    });
  }
});

// Get FAQ extraction status for authenticated user
router.get('/extraction-status', auth, async (req, res) => {
  console.log('🔍 FAQ EXTRACTION STATUS CHECK ENDPOINT HIT!');
  console.log('User ID:', req.user.userId);
  
  try {
    const business = await Business.findOne({ user: req.user.userId });

    if (!business) {
      console.log('❌ Business not found for user:', req.user.userId);
      return res.status(404).json({
        message: 'Business information not found.',
        status: null
      });
    }

    const status = business.faqExtractionStatus || 'idle';
    const updatedAt = business.faqExtractionUpdatedAt;
    const taskId = business.faqExtractionTaskId;

    console.log(`✅ Retrieved status "${status}" for user ${req.user.userId}`);
    
    res.json({
      status: status,
      updatedAt: updatedAt,
      taskId: taskId,
      message: status === 'idle' ? 'No extraction in progress' : `Current status: ${status}`
    });

  } catch (error) {
    console.error('Get FAQ extraction status error:', error);
    res.status(500).json({
      message: 'Failed to retrieve FAQ extraction status.',
      error: error.message,
      status: null
    });
  }
});

// Update FAQ extraction status
router.post('/update-status', async (req, res) => {
  console.log('🔄 FAQ EXTRACTION STATUS UPDATE ENDPOINT HIT!');
  console.log('Request body:', req.body);
  
  try {
    const { userId, status, taskId } = req.body;

    if (!userId || !status) {
      console.log('❌ Missing required fields:', { userId: !!userId, status: !!status });
      return res.status(400).json({
        message: 'userId and status are required.',
        received: { userId, status }
      });
    }

    // Validate status values
    const validStatuses = ['ongoing', 'completed', 'failed', 'stopped'];
    if (!validStatuses.includes(status)) {
      console.log('❌ Invalid status:', status);
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        received: { status }
      });
    }

    // Update business record with FAQ extraction status
    const business = await Business.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          faqExtractionStatus: status,
          faqExtractionUpdatedAt: new Date(),
          ...(taskId && { faqExtractionTaskId: taskId })
        }
      },
      { new: true }
    );

    if (!business) {
      console.log('❌ Business not found for user:', userId);
      return res.status(404).json({
        message: 'Business not found for the provided user.'
      });
    }

    console.log(`✅ Successfully updated FAQ extraction status to "${status}" for user ${userId}`);
    
    res.json({
      message: 'FAQ extraction status updated successfully.',
      status: status,
      updatedAt: business.faqExtractionUpdatedAt
    });

  } catch (error) {
    console.error('Update FAQ extraction status error:', error);
    res.status(500).json({
      message: 'Failed to update FAQ extraction status.',
      error: error.message
    });
  }
});

module.exports = router;