const Order = require('../../models/orderSchema'); 


const listOrders = async (req, res) => {
    try {
        const orders = await Order.find()
        res.render('orders',{orders});
    } catch (error) {
        console.error('Error fetching orders: ', error);
        res.status(500).send('Internal Server Error');
    }
};


const changeOrderStatus = async (req, res) => {
    try {
        const { id } = req.params; 
        const { status } = req.body; 
        if (!status || !['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Request', 'Returned'].includes(status)) {
            return res.status(400).send('Invalid status');
        }

        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).send('Order not found');
        }

        order.status = status;
        if(order.status === 'Delivered'){
            order.paymentStatus = 'Paid';
            await order.save();
        }
        await order.save();

        res.redirect('/admin/orders');
    } catch (error) {
        console.error('Error changing order status: ', error);
        res.status(500).send('Internal Server Error');
    }
};


const cancelOrder = async (req, res) => {
    try {
        const { id } = req.params; 

        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).send('Order not found');
        }

        
        if (order.status !== 'Pending') {
            return res.status(400).send('Order cannot be cancelled in its current status');
        }

        order.status = 'Cancelled'; 
        await order.save(); 

        res.redirect('/admin/orders'); 
    } catch (error) {
        console.error('Error cancelling order: ', error);
        res.status(500).send('Internal Server Error');
    }
};

module.exports = {
    listOrders,
    changeOrderStatus,
    cancelOrder
};
