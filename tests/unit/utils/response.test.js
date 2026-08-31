const { successResponse, errorResponse } = require('../../../src/utils/response');

describe('Response Utility (src/utils/response.js)', () => {
  let mockRes;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('successResponse()', () => {
    it('should respond with default status 200 and formatted JSON', () => {
      const data = { id: 1, name: 'Product A' };
      successResponse(mockRes, 'Fetch success', data);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Fetch success',
        data
      });
    });

    it('should support custom status code (e.g. 201 Created)', () => {
      const data = { id: 2 };
      successResponse(mockRes, 'Created', data, 201);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Created',
        data
      });
    });
  });

  describe('errorResponse()', () => {
    it('should respond with default status 400 and error message JSON', () => {
      errorResponse(mockRes, 'Bad request');

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Bad request'
      });
    });

    it('should support custom error status code (e.g. 404 Not Found)', () => {
      errorResponse(mockRes, 'Resource not found', 404);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Resource not found'
      });
    });
  });
});
