const express = require('express');
const router = express.Router();
const biometricController = require('../controllers/biometricController');
const auth = require('../middlewares/auth');

router.get('/register-options', auth, biometricController.getRegistrationOptions);
router.post('/verify-registration', auth, biometricController.verifyRegistration);
router.get('/auth-options', biometricController.getAuthenticationOptions);
router.post('/verify-auth', biometricController.verifyAuthentication);

module.exports = router;
