const express = require('express');
const router = express.Router();

const Category = require('../controllers/categoryController');

router.post('/', Category.create);
router.get('/', Category.findAll);
router.get('/:id', Category.findOne);
router.put('/:id', Category.update);
router.delete('/:id', Category.delete);

module.exports = router;