const {
  generateAccessToken,
  generateRefreshToken,
  generateResetToken,
  verifyResetToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateTempToken,
  verifyTempToken
} = require('../../../src/utils/jwt');

describe('JWT Utility (src/utils/jwt.js)', () => {
  const mockUser = {
    id: 101,
    email: 'user@example.com',
    roles: ['Customer'],
    permissions: ['view_products']
  };

  describe('Access Token', () => {
    it('should generate and verify an access token with correct payload', () => {
      const token = generateAccessToken(mockUser);
      expect(typeof token).toBe('string');

      const decoded = verifyAccessToken(token);
      expect(decoded.id).toBe(mockUser.id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.roles).toEqual(mockUser.roles);
      expect(decoded.permissions).toEqual(mockUser.permissions);
    });

    it('should throw an error for a forged or invalid access token', () => {
      expect(() => {
        verifyAccessToken('invalid.token.payload');
      }).toThrow();
    });
  });

  describe('Refresh Token', () => {
    it('should generate and verify a refresh token', () => {
      const token = generateRefreshToken(mockUser);
      expect(typeof token).toBe('string');

      const decoded = verifyRefreshToken(token);
      expect(decoded.id).toBe(mockUser.id);
    });
  });

  describe('Reset Token', () => {
    it('should generate and verify a reset password token', () => {
      const token = generateResetToken(mockUser);
      expect(typeof token).toBe('string');

      const decoded = verifyResetToken(token);
      expect(decoded.userId).toBe(mockUser.id);
    });
  });

  describe('Temp 2FA Token', () => {
    it('should generate and verify a 2FA temporary token', () => {
      const token = generateTempToken(mockUser);
      expect(typeof token).toBe('string');

      const decoded = verifyTempToken(token);
      expect(decoded.id).toBe(mockUser.id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.purpose).toBe('two_fa_verification');
    });
  });
});
