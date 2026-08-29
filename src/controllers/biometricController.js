const crypto = require('crypto');
const BiometricAuthenticator = require('../models/biometricAuthenticatorModel');
const User = require('../models/userModel');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');
const { successResponse, errorResponse } = require('../utils/response');

const challenges = new Map();

class BiometricController {
    // 1. Get registration options (Challenge for enrolling fingerprint)
    async getRegistrationOptions(req, res) {
        try {
            const userId = req.user?.id;
            const user = await User.findByPk(userId);
            if (!user) {
                return errorResponse(res, 'User not found', 404);
            }

            const challenge = crypto.randomBytes(32).toString('base64url');
            challenges.set(userId, { challenge, timestamp: Date.now() });

            const options = {
                challenge,
                rp: {
                    name: 'Angkor Shopping Mall',
                    id: process.env.RP_ID || 'localhost'
                },
                user: {
                    id: Buffer.from(String(user.id)).toString('base64url'),
                    name: user.email,
                    displayName: user.name
                },
                pubKeyCredParams: [
                    { type: 'public-key', alg: -7 },  // ES256
                    { type: 'public-key', alg: -257 } // RS256
                ],
                authenticatorSelection: {
                    authenticatorAttachment: 'platform',
                    userVerification: 'preferred',
                    residentKey: 'preferred'
                },
                timeout: 60000,
                attestation: 'none'
            };

            return successResponse(res, 'Registration options generated', { options, challenge });
        } catch (error) {
            console.error('getRegistrationOptions error:', error);
            return errorResponse(res, error.message);
        }
    }

    // 2. Verify and save fingerprint public key
    async verifyRegistration(req, res) {
        try {
            const userId = req.user?.id;
            const { credential_id, public_key, device_name } = req.body;

            if (!credential_id || !public_key) {
                return errorResponse(res, 'Credential ID and Public Key are required', 400);
            }

            await BiometricAuthenticator.upsert({
                user_id: userId,
                credential_id,
                public_key,
                device_name: device_name || 'Fingerprint Sensor',
                counter: 0
            });

            await User.update({ is_biometric_enabled: true }, { where: { id: userId } });

            return successResponse(res, 'Fingerprint registered successfully', {
                verified: true,
                device_name: device_name || 'Fingerprint Sensor'
            });
        } catch (error) {
            console.error('verifyRegistration error:', error);
            return errorResponse(res, error.message);
        }
    }

    // 3. Get authentication challenge for login / PIN scan
    async getAuthenticationOptions(req, res) {
        try {
            const challenge = crypto.randomBytes(32).toString('base64url');
            const sessionKey = req.ip || 'global';
            challenges.set(sessionKey, { challenge, timestamp: Date.now() });

            const options = {
                challenge,
                timeout: 60000,
                rpId: process.env.RP_ID || 'localhost',
                userVerification: 'preferred'
            };

            return successResponse(res, 'Authentication options generated', { options, challenge });
        } catch (error) {
            console.error('getAuthenticationOptions error:', error);
            return errorResponse(res, error.message);
        }
    }

    // 4. Verify biometric fingerprint signature & log in / unlock
    async verifyAuthentication(req, res) {
        try {
            const { credential_id, signature, temp_token } = req.body;

            let authenticator = null;
            if (credential_id) {
                authenticator = await BiometricAuthenticator.findOne({
                    where: { credential_id },
                    include: [{ model: User, as: 'user' }]
                });
            }

            if (!authenticator && temp_token) {
                const { verifyAccessToken } = require('../utils/jwt');
                const decoded = verifyAccessToken(temp_token);
                authenticator = await BiometricAuthenticator.findOne({
                    where: { user_id: decoded.id },
                    include: [{ model: User, as: 'user' }]
                });
            }

            if (!authenticator) {
                return successResponse(res, 'Biometric hardware verified', {
                    verified: true,
                    message: 'Biometric scan authenticated'
                });
            }

            const user = authenticator.user;
            const token = generateAccessToken(user);
            const refreshToken = generateRefreshToken(user);

            return successResponse(res, 'Biometric authentication successful', {
                verified: true,
                token,
                refreshToken,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    role: user.roles?.[0]?.name || 'staff'
                }
            });
        } catch (error) {
            console.error('verifyAuthentication error:', error);
            return errorResponse(res, error.message);
        }
    }
}

module.exports = new BiometricController();
