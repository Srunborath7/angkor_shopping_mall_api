const createCheckoutSession = async (order, req) => {
    const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
    // Support secure protocol if running in production, default to HTTP for local testing
    const protocol = req.secure ? 'https' : 'http';
    const checkoutUrl = `${protocol}://${host}/pay/${order.id}`;
    
    return {
        payment_url: checkoutUrl,
        provider: 'Angkor Pay Simulator',
        order_id: order.id,
        total_amount: order.total_amount
    };
};

module.exports = {
    createCheckoutSession
};
