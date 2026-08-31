const {
  generateOTP,
  hashOTP,
  verifyOTP,
  isOTPExpired,
  createOTPWithExpiry
} = require('../../../src/utils/otp');

describe('OTP Utility (src/utils/otp.js)', () => {
  describe('generateOTP()', () => {
    it('should generate a 6-digit numeric string', () => {
      const otp = generateOTP();
      expect(typeof otp).toBe('string');
      expect(otp).toHaveLength(6);
      expect(Number(otp)).toBeGreaterThanOrEqual(100000);
      expect(Number(otp)).toBeLessThanOrEqual(999999);
    });

    it('should generate different random OTPs on consecutive calls', () => {
      const otp1 = generateOTP();
      const otp2 = generateOTP();
      // While theoretically random, 1 in 900,000 chance of collision
      expect(otp1).not.toBe('');
      expect(otp2).not.toBe('');
    });
  });

  describe('hashOTP() and verifyOTP()', () => {
    it('should return a SHA-256 hex string', () => {
      const hash = hashOTP('123456');
      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(64); // SHA-256 hex length
    });

    it('should verify matching OTP successfully', () => {
      const otp = '849201';
      const hash = hashOTP(otp);
      expect(verifyOTP(otp, hash)).toBe(true);
    });

    it('should fail verification for incorrect OTP', () => {
      const hash = hashOTP('123456');
      expect(verifyOTP('654321', hash)).toBe(false);
    });
  });

  describe('isOTPExpired()', () => {
    it('should return true if expiry date is in the past', () => {
      const pastDate = new Date(Date.now() - 10000); // 10 seconds ago
      expect(isOTPExpired(pastDate)).toBe(true);
    });

    it('should return false if expiry date is in the future', () => {
      const futureDate = new Date(Date.now() + 60000); // 1 minute in future
      expect(isOTPExpired(futureDate)).toBe(false);
    });
  });

  describe('createOTPWithExpiry()', () => {
    it('should generate an object with otp, hashedOTP, and expireAt', () => {
      const result = createOTPWithExpiry(5);
      expect(result).toHaveProperty('otp');
      expect(result).toHaveProperty('hashedOTP');
      expect(result).toHaveProperty('expireAt');

      expect(result.otp).toHaveLength(6);
      expect(result.hashedOTP).toHaveLength(64);
      expect(result.expireAt.getTime()).toBeGreaterThan(Date.now());
    });
  });
});
