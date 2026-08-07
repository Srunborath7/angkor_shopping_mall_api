const Brand = require('../models/brandModel');
const User = require('../models/userModel');

class BrandService {

  async createBrand(data) {
    return await Brand.create(data);
  }

  async getAllBrands() {
    return await Brand.findAll({
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'updater', attributes: ['id', 'name', 'email'] }
      ]
    });
  }

  async getBrandById(id) {
    return await Brand.findByPk(id, {
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'updater', attributes: ['id', 'name', 'email'] }
      ]
    });
  }

  async updateBrand(id, data) {
    const brand = await Brand.findByPk(id);

    if (!brand) {
      throw new Error('Brand not found');
    }

    await brand.update(data);

    return await this.getBrandById(id);
  }

  async deleteBrand(id) {
    const brand = await Brand.findByPk(id);

    if (!brand) {
      throw new Error('Brand not found');
    }

    await brand.destroy();

    return true;
  }
}

module.exports = new BrandService();