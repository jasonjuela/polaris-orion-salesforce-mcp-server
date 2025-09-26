import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || 'dev-encryption-key-change-in-production';
const ALGORITHM = 'aes-256-gcm';

interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
}

/**
 * Encrypt sensitive data like refresh tokens
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Combine IV and encrypted data
  const combined = iv.toString('hex') + ':' + encrypted;
  return Buffer.from(combined).toString('base64');
}

/**
 * Decrypt sensitive data like refresh tokens
 */
export function decrypt(encryptedText: string): string {
  try {
    const combined = Buffer.from(encryptedText, 'base64').toString('utf8');
    
    // Only support secure format with proper IV
    if (!combined.includes(':')) {
      throw new Error('Legacy encrypted data format is no longer supported for security reasons');
    }
    
    const [ivHex, encrypted] = combined.split(':');
    
    if (!ivHex || !encrypted) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error('Failed to decrypt data');
  }
}