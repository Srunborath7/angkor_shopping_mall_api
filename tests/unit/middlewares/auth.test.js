const auth = require('../../../src/middlewares/auth');
const jwtUtil = require('../../../src/utils/jwt');

describe('Auth Middleware (src/middlewares/auth.js)', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      headers: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
  });

  it('should return 401 if authorization header is missing', () => {
    auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Authorization token required'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 if authorization header is not Bearer format', () => {
    req.headers.authorization = 'Basic dXNlcjpwYXNz';
    auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Authorization token required'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 if token is invalid or expired', () => {
    req.headers.authorization = 'Bearer invalid.or.tampered.token';
    auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid or expired authorization token'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should attach decoded user to req and call next() on valid token', () => {
    const validUser = { id: 1, email: 'test@example.com', roles: ['Admin'] };
    const token = jwtUtil.generateAccessToken(validUser);

    req.headers.authorization = `Bearer ${token}`;
    auth(req, res, next);

    expect(req.user).toBeDefined();
    expect(req.user.id).toBe(1);
    expect(req.user.email).toBe('test@example.com');
    expect(next).toHaveBeenCalledTimes(1);
  });
});
