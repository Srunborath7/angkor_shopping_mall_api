const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const optionalAuth = require('../middlewares/optionalAuth');
const supportMessageController = require('../controllers/supportMessageController');

// Public / User routes
router.post('/send', optionalAuth, supportMessageController.sendMessage);
router.get('/my-messages', auth, supportMessageController.getMyMessages);

// Admin routes (requires auth)
router.get('/messages', auth, supportMessageController.getMessages);
router.get('/messages/:id', auth, supportMessageController.getMessageById);
router.post('/messages/:id/reply', auth, supportMessageController.replyMessage);
router.post('/messages/:id/ai-draft', auth, supportMessageController.generateAiDraft);
router.get('/stats', auth, supportMessageController.getStats);

module.exports = router;
