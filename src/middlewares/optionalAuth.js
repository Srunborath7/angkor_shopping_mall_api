/**
 * optionalAuth.js
 *
 * Like `auth`, but never blocks the request.
 * If a valid Bearer token is present, req.user is populated.
 * If absent or invalid, req.user stays undefined and the request continues.
 *
 * Use on public routes where logged-in users get richer behaviour
 * (e.g. interaction tracking on product views and searches).
 */

const { verifyAccessToken } = require('../utils/jwt');

const optionalAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token   = authHeader.split(' ')[1];
            req.user      = verifyAccessToken(token);
        }
    } catch {
        // Token invalid or expired — silently ignore, treat as unauthenticated
        req.user = undefined;
    }
    next();
};

module.exports = optionalAuth;
