const successResponse = (res, message, data = null, status = 200) => {
    return res.status(status).json({
        success: true,
        message,
        data
    });
};

const errorResponse = (res, message, status = 400, errors = null) => {
    const response = {
        success: false,
        message
    };
    if (errors && ((Array.isArray(errors) && errors.length > 0) || (typeof errors === 'object' && Object.keys(errors).length > 0))) {
        response.errors = errors;
    }
    return res.status(status).json(response);
};

const handleControllerError = (res, error, defaultMsg = 'An error occurred') => {
    if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
        const errors = {};
        if (error.errors && Array.isArray(error.errors)) {
            error.errors.forEach(err => {
                const field = err.path || 'error';
                let msg = err.message;
                if (err.type === 'unique violation' || error.name === 'SequelizeUniqueConstraintError') {
                    msg = `${field.charAt(0).toUpperCase() + field.slice(1)} is already in use`;
                }
                errors[field] = msg;
            });
        }
        const firstMsg = Object.values(errors)[0] || error.message || 'Validation error';
        return errorResponse(res, firstMsg, 400, errors);
    }

    if (error.errors && typeof error.errors === 'object' && Object.keys(error.errors).length > 0) {
        const firstMsg = Object.values(error.errors)[0] || error.message || defaultMsg;
        return errorResponse(res, firstMsg, error.status || 400, error.errors);
    }

    return errorResponse(res, error.message || defaultMsg, error.status || 400);
};

module.exports = {
    successResponse,
    errorResponse,
    handleControllerError
};