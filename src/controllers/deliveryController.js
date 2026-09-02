const Delivery = require('../models/deliveryModel');
const Order = require('../models/orderModel');
const User = require('../models/userModel');
const { sendSuccess, sendError } = require('../utils/response');

// POST /api/deliveries (Create or update delivery dispatch record)
exports.createOrUpdateDelivery = async (req, res) => {
    try {
        const {
            order_id,
            carrier,
            driver_name,
            driver_phone,
            tracking_number,
            estimated_time,
            notes,
            status = 'in_transit'
        } = req.body;

        if (!order_id || !driver_name) {
            return sendError(res, 'order_id and driver_name are required', 400);
        }

        // Verify order exists
        const order = await Order.findByPk(order_id);
        if (!order) {
            return sendError(res, 'Order not found', 404);
        }

        // Find existing delivery or create new
        let delivery = await Delivery.findOne({ where: { order_id } });

        if (delivery) {
            delivery.carrier = carrier || delivery.carrier;
            delivery.driver_name = driver_name || delivery.driver_name;
            delivery.driver_phone = driver_phone !== undefined ? driver_phone : delivery.driver_phone;
            delivery.tracking_number = tracking_number !== undefined ? tracking_number : delivery.tracking_number;
            delivery.estimated_time = estimated_time !== undefined ? estimated_time : delivery.estimated_time;
            delivery.notes = notes !== undefined ? notes : delivery.notes;
            delivery.status = status || delivery.status;
            if (status === 'delivered') {
                delivery.delivered_at = new Date();
            }
            await delivery.save();
        } else {
            delivery = await Delivery.create({
                order_id,
                carrier: carrier || 'In-House Courier',
                driver_name,
                driver_phone: driver_phone || null,
                tracking_number: tracking_number || null,
                estimated_time: estimated_time || null,
                notes: notes || null,
                status: status || 'in_transit',
                dispatched_at: new Date(),
                delivered_at: status === 'delivered' ? new Date() : null
            });
        }

        // Also update order status
        if (status === 'delivered') {
            order.status = 'completed';
        } else if (order.status !== 'completed' && order.status !== 'cancelled') {
            order.status = 'shipped';
        }
        await order.save();

        return sendSuccess(res, 'Delivery dispatched and recorded successfully', delivery, 200);
    } catch (error) {
        console.error('Delivery controller error:', error);
        return sendError(res, error.message || 'Failed to process delivery record', 500);
    }
};

// GET /api/deliveries (List all deliveries for admin)
exports.getDeliveries = async (req, res) => {
    try {
        const deliveries = await Delivery.findAll({
            include: [
                {
                    model: Order,
                    as: 'order',
                    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] }]
                }
            ],
            order: [['created_at', 'DESC']]
        });
        return sendSuccess(res, 'Deliveries fetched successfully', deliveries, 200);
    } catch (error) {
        return sendError(res, error.message || 'Failed to fetch deliveries', 500);
    }
};

// GET /api/deliveries/order/:orderId
exports.getDeliveryByOrderId = async (req, res) => {
    try {
        const { orderId } = req.params;
        const delivery = await Delivery.findOne({
            where: { order_id: orderId },
            include: [
                {
                    model: Order,
                    as: 'order',
                    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] }]
                }
            ]
        });

        if (!delivery) {
            return sendError(res, 'No delivery record found for this order', 404);
        }
        return sendSuccess(res, 'Delivery details fetched', delivery, 200);
    } catch (error) {
        return sendError(res, error.message || 'Failed to fetch delivery details', 500);
    }
};

// PUT /api/deliveries/:id (Update delivery record)
exports.updateDelivery = async (req, res) => {
    try {
        const { id } = req.params;
        const delivery = await Delivery.findByPk(id);

        if (!delivery) {
            return sendError(res, 'Delivery record not found', 404);
        }

        const { carrier, driver_name, driver_phone, tracking_number, estimated_time, notes, status } = req.body;

        if (carrier !== undefined) delivery.carrier = carrier;
        if (driver_name !== undefined) delivery.driver_name = driver_name;
        if (driver_phone !== undefined) delivery.driver_phone = driver_phone;
        if (tracking_number !== undefined) delivery.tracking_number = tracking_number;
        if (estimated_time !== undefined) delivery.estimated_time = estimated_time;
        if (notes !== undefined) delivery.notes = notes;
        if (status !== undefined) {
            delivery.status = status;
            if (status === 'delivered') {
                delivery.delivered_at = new Date();
                // Mark associated order as completed
                await Order.update({ status: 'completed' }, { where: { id: delivery.order_id } });
            }
        }

        await delivery.save();
        return sendSuccess(res, 'Delivery record updated successfully', delivery, 200);
    } catch (error) {
        return sendError(res, error.message || 'Failed to update delivery', 500);
    }
};
