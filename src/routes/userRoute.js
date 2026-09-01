const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middlewares/auth');

// Customer & Staff routes
router.post('/heartbeat', auth, userController.heartbeat);
router.get('/customers', userController.getCustomers);
router.get('/staff', userController.getStaff);

// Password change routes
router.put('/:id/change-password', userController.adminChangePassword);
router.put('/change-my-password', auth, userController.changePassword);

// 2FA Management routes
router.post('/:id/2fa/enable', auth, userController.setTwoFAPin);
router.post('/:id/2fa/disable', auth, userController.disable2FA);

// Standard CRUD routes
router.post('/', userController.create);
router.get('/', userController.findAll);
router.get('/:id', userController.findOne);
router.put('/:id', userController.update);
router.delete('/:id', userController.delete);

module.exports = router;
