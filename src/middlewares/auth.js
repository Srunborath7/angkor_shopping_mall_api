const { verifyAccessToken } = require('../utils/jwt');
const { errorResponse } = require('../utils/response');

const auth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return errorResponse(res, 'Authorization token required', 401);
        }

        const token = authHeader.split(' ')[1];
        const decoded = verifyAccessToken(token);
        
        req.user = decoded;
        next();
    } catch (error) {
        return errorResponse(res, 'Invalid or expired authorization token', 401);
    }
};

module.exports = auth;
