const roleService = require('../services/roleservice');
const {
    successResponse,
    errorResponse
} = require('../utils/response');

class RoleController {

    async create(req, res) {
        try {
            const role = await roleService.createRole(req.body);

            return successResponse(
                res,
                'Role created successfully',
                role,
                201
            );
        } catch (error) {
            return errorResponse(res, error.message, 400);
        }
    }

    async findAll(req, res) {
        try {
            const roles = await roleService.getAllRoles();

            return successResponse(
                res,
                'Roles retrieved successfully',
                roles
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async getPermissions(req, res) {
        try {
            const permissions = await roleService.getAllPermissions();

            return successResponse(
                res,
                'Permissions retrieved successfully',
                permissions
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findOne(req, res) {
        try {
            const role = await roleService.getRoleById(req.params.id);

            if (!role) {
                return errorResponse(res, 'Role not found', 404);
            }

            return successResponse(
                res,
                'Role retrieved successfully',
                role
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async update(req, res) {
        try {
            const role = await roleService.updateRole(
                req.params.id,
                req.body
            );

            return successResponse(
                res,
                'Role updated successfully',
                role
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async delete(req, res) {
        try {
            await roleService.deleteRole(req.params.id);

            return successResponse(
                res,
                'Role deleted successfully'
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }
}

module.exports = new RoleController();
