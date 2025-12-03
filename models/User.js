const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  businessName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  termsAccepted: {
    type: Boolean,
    required: true,
    default: false
  },
  instagramAccountId: {
    type: String,
    required: false,
    trim: true
  },
  instagramAccessToken: {
    type: String,
    required: false,
    trim: true
  },
  instagramAppConfig: {
    appName: {
      type: String,
      required: false,
      trim: true
    },
    appId: {
      type: String,
      required: false,
      trim: true
    },
    appSecret: {
      type: String,
      required: false,
      trim: true
    }
  },
  instagramIntegrationStatus: {
    type: String,
    enum: ['not_connected', 'pending', 'connected'],
    default: 'not_connected'
  },
  instagramCredentials: {
    email: {
      type: String,
      required: false,
      trim: true,
      lowercase: true
    },
    username: {
      type: String,
      required: false,
      trim: true
    },
    encryptedData: {
      type: String,
      required: false
    },
    iv: {
      type: String,
      required: false
    }
  },
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: false
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);