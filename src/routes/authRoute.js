const express = require('express');
const router = express.Router();

const userController = require('../controllers/userController');

router.post('/login', userController.login);
router.post('/register', userController.create);
router.post('/refresh-token', userController.refreshToken);
router.post('/logout', userController.logout);
router.post('/change-password', userController.changePassword);
router.post('/forgot-password', userController.sendResetOtp);
router.post('/verify-reset-otp', userController.verifyResetOtp);
router.post('/reset-password', userController.resetPassword);
module.exports = router;