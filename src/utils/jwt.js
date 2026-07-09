const jwt = require('jsonwebtoken');

const ACCESS_SECRET = process.env.ACCESS_SECRET || 'access_secret';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refresh_secret';
const RESET_SECRET = process.env.RESET_SECRET || 'reset_secret';

const generateAccessToken = (user) => {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            roles: user.roles
        },
        ACCESS_SECRET,
        { expiresIn: '15m' }
    );
};

const generateRefreshToken = (user) => {
    return jwt.sign(
        {
            id: user.id
        },
        REFRESH_SECRET,
        { expiresIn: '7d' }
    );
};

const generateResetToken = (user) => {
    return jwt.sign(
        { userId: user.id },
        RESET_SECRET,
        { expiresIn: '10m' }
    );
};

const verifyResetToken = (token) => {
    return jwt.verify(token, RESET_SECRET);
};

const verifyAccessToken = (token) => {
    return jwt.verify(token, ACCESS_SECRET);
};

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    generateResetToken,
    verifyResetToken,
    verifyAccessToken
};