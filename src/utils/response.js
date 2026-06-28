const successResponse = (res, message, data = null) => {
    return res.status(200).json({
        success: true,
        message,
        data
    });
};

const errorResponse = (res, message) => {
    return res.status(401).json({
        success: false,
        message
    });
};

module.exports = {
    successResponse,
    errorResponse
};