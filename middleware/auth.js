const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  console.log('🔐 AUTH MIDDLEWARE HIT!');
  console.log('Request path:', req.path);
  console.log('Authorization header:', req.header('Authorization') ? '[PRESENT]' : '[MISSING]');

  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      console.log('❌ No token provided');
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');
    req.user = decoded;
    console.log('✅ Token validated, user ID:', decoded.userId);
    next();
  } catch (error) {
    console.log('❌ Token validation failed:', error.message);
    res.status(401).json({ message: 'Invalid token.' });
  }
};

module.exports = auth;