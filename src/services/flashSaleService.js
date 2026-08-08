const FlashSale = require('../models/flashSaleModel');

class FlashSaleService {
    async create(data) {
        return await FlashSale.create(data);
    }

    async findAll() {
        return await FlashSale.findAll({
            order: [['created_at', 'DESC']]
        });
    }

    async findActive() {
        return await FlashSale.findAll({
            where: { status: 'active' },
            order: [['created_at', 'DESC']]
        });
    }

    async findById(id) {
        return await FlashSale.findByPk(id);
    }

    async update(id, data) {
        const sale = await FlashSale.findByPk(id);
        if (!sale) throw new Error('Flash sale deal not found');
        await sale.update(data);
        return sale;
    }

    async delete(id) {
        const sale = await FlashSale.findByPk(id);
        if (!sale) throw new Error('Flash sale deal not found');
        await sale.destroy();
        return true;
    }
}

module.exports = new FlashSaleService();
