const express = require('express');
const router = express.Router();

const Brand = require('../controllers/brandController');

router.post('/', Brand.create);
router.get('/', Brand.findAll);
router.get('/:id', Brand.findOne);
router.put('/:id', Brand.update);
router.delete('/:id', Brand.delete);

module.exports = router;