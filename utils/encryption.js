const crypto = require('crypto');

// Get master encryption key from environment
const MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || 'default-master-key-change-in-production-32-chars';

// Encrypt data using master key
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(MASTER_KEY.padEnd(32, '0').slice(0, 32)), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encryptedData: encrypted,
    iv: iv.toString('hex')
  };
}

// Decrypt data using master key
function decrypt(encryptedData, iv) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(MASTER_KEY.padEnd(32, '0').slice(0, 32)), Buffer.from(iv, 'hex'));

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = {
  encrypt,
  decrypt
};