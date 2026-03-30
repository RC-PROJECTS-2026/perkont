import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

export class FieldEncryption {
  private static getKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is required. Application cannot start without it.');
    }
    return crypto.createHash('sha256').update(key).digest();
  }

  static encrypt(text: string): string {
    if (!text) return text;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, this.getKey(), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  static decrypt(encryptedText: string): string {
    if (!encryptedText || !encryptedText.startsWith('enc:')) return encryptedText;
    const parts = encryptedText.split(':');
    if (parts.length !== 4) return encryptedText;
    const [, ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, this.getKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  static isEncrypted(value: string): boolean {
    return value?.startsWith('enc:') || false;
  }
}
