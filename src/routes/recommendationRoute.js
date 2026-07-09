const express = require('express');
const router = express.Router();
const recommendationController = require('../controllers/recommendationController');
const auth = require('../middlewares/auth');

router.get('/', auth, recommendationController.getRecommendations);

module.exports = router;
