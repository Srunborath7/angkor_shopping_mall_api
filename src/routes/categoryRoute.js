const express = require('express');
const router = express.Router();
const Category = require('../controllers/categoryController');
const auth = require('../middlewares/auth');

router.post('/', auth, Category.create);
router.get('/', Category.findAll);
router.get('/:id', Category.findOne);
router.put('/:id', auth, Category.update);
router.delete('/:id', auth, Category.delete);

module.exports = router;