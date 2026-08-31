const normalizePhone = require('../../../src/utils/phone');

describe('Phone Utility (src/utils/phone.js)', () => {
  it('should return null when input is null, undefined, or empty', () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });

  it('should convert Cambodian country code (855...) to standard 0... format', () => {
    expect(normalizePhone('855974242291')).toBe('0974242291');
    expect(normalizePhone('+85512345678')).toBe('012345678');
  });

  it('should strip special characters, spaces, and hyphens', () => {
    expect(normalizePhone('+855 (97) 424-2291')).toBe('0974242291');
    expect(normalizePhone('097 424 2291')).toBe('0974242291');
    expect(normalizePhone('097-424-2291')).toBe('0974242291');
  });

  it('should preserve already formatted domestic numbers', () => {
    expect(normalizePhone('0974242291')).toBe('0974242291');
    expect(normalizePhone('012345678')).toBe('012345678');
  });
});
