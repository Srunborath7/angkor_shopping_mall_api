const express = require('express');
const router = express.Router();

const roleController = require('../controllers/roleController');

router.get('/permissions', roleController.getPermissions);
router.post('/', roleController.create);
router.get('/', roleController.findAll);
router.get('/:id', roleController.findOne);
router.put('/:id', roleController.update);
router.delete('/:id', roleController.delete);

module.exports = router;