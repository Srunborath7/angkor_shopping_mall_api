const express = require('express');
const router = express.Router();
const testimonialController = require('../controllers/testimonialController');
const auth = require('../middlewares/auth');
const optionalAuth = require('../middlewares/optionalAuth');

// Public endpoints
router.get('/published', testimonialController.getPublished);
router.post('/', optionalAuth, testimonialController.create);

// Admin endpoints (require auth)
router.get('/', auth, testimonialController.getAll);
router.patch('/:id/publish', auth, testimonialController.togglePublish);
router.put('/:id', auth, testimonialController.update);
router.delete('/:id', auth, testimonialController.delete);

module.exports = router;
