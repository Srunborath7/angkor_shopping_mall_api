const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');
const auth = require('../middlewares/auth');

router.post('/', auth, supplierController.create);
router.get('/', supplierController.findAll);
router.get('/:id', supplierController.findOne);
router.put('/:id', auth, supplierController.update);
router.delete('/:id', auth, supplierController.delete);

module.exports = router;
