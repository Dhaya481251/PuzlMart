const axios = require('axios');
const Order = require('../models/orderSchema');
const User = require('../models/userSchema');
const Product = require('../models/productSchema');

async function generateAccessToken() {
    try {
        const response = await axios({
            url: process.env.PAYPAL_BASE_URL + '/v1/oauth2/token',
            method: 'POST',
            data: 'grant_type=client_credentials',
            auth: {
                username: process.env.PAYPAL_CLIENT_ID,
                password: process.env.PAYPAL_SECRET
            }
        });
        console.log('Access token generated: ', response.data.access_token);
        return response.data.access_token;
    } catch (error) {
        console.error('Error generating access token: ', error.response?.data || error.message);
        throw new Error('Failed to generate PayPal access token');
    }
}

async function convertCurrency(amountInINR) {
    try {
        const response = await axios.get(`https://api.exchangerate-api.com/v4/latest/INR`);
        const conversionRate = response.data.rates.USD;
        return (amountInINR * conversionRate).toFixed(2); 
    } catch (error) {
        console.error('Error converting currency: ', error.message);
        throw new Error('Failed to convert INR to USD');
    }
}

exports.createOrder = async (userId, id) => {
    try {
        const order = await Order.findById({ _id:id })
            .populate('items.productId')
            .populate('userId');
        if (!order) {
            throw new Error('Order is not found');
        }

        const validItems = order.items.filter(item => {
            const product = item.productId;
            return product && product.productName && product.salePrice;
        });

        const purchaseUnits = [];
        let itemTotalUSD = 0;
        for (const item of validItems) {
            const product = item.productId;
            const unitPriceINR = product.salePrice;
            const unitPriceUSD = await convertCurrency(unitPriceINR);
            const description = product.description || 'No description provided';
            const truncatedDescription = description.length > 127 ? description.substring(0, 127) : description;

            itemTotalUSD += parseFloat(unitPriceUSD) * item.quantity;

            purchaseUnits.push({
                name: product.productName,
                description: truncatedDescription,
                quantity: item.quantity,
                unit_amount: {
                    currency_code: 'USD',
                    value: unitPriceUSD,
                },
            });
        }

        const discountUSD = await convertCurrency(order.discount);
        const finalAmountUSD = (itemTotalUSD - parseFloat(discountUSD)).toFixed(2);

        console.log('finalAmountUSD:', finalAmountUSD);
        console.log('discountUSD:', discountUSD);

        const accessToken = await generateAccessToken();

        const response = await axios({
            url: process.env.PAYPAL_BASE_URL + '/v2/checkout/orders',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + accessToken
            },
            data: {
                intent: 'CAPTURE',
                purchase_units: [{
                    reference_id: 'default',
                    amount: {
                        currency_code: 'USD',
                        value: finalAmountUSD,
                        breakdown: {
                            item_total: {
                                currency_code: 'USD',
                                value: itemTotalUSD.toFixed(2),
                            },
                            discount: {
                                currency_code: 'USD',
                                value: discountUSD
                            }
                        }
                    },
                    items: purchaseUnits,
                }],
                application_context: {
                    return_url: `http://localhost:3000/orderDetails/${id}`,
                    cancel_url: 'http://localhost:3000',
                    shipping_preference: 'NO_SHIPPING',
                    user_action: 'PAY_NOW',
                    brand_name: 'Puzl Mart'
                }
            }
        });

        const approvalLink = response.data.links.find((link) => link.rel === 'approve');
        if (!approvalLink) {
            throw new Error('Approval link not found in PayPal response');
        }
        await capturePayment(response.data.id,id,accessToken);
        await Order.findByIdAndUpdate({_id:id},{paypalOrderId:response.data.id});
        console.log('PayPal order created:', response.data.id);
        return approvalLink.href;

    } catch (error) {
        console.error('Error creating PayPal order:', error.response?.data || error.message);

        if (error.response) {
            console.error('Error response data:', error.response.data);
            console.error('Error response status:', error.response.status);
            console.error('Error response headers:', error.response.headers);
        }

        throw new Error('Failed to create PayPal order');
    }
};


exports.capturePayment = async function capturePayment(paypalOrderId,id,accessToken) {
    try {
        const accessToken = await generateAccessToken();

        const response = await axios({
            url: `${process.env.PAYPAL_BASE_URL}/v2/checkout/orders/${id}/capture`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        if (response.data.status === 'COMPLETED') {
            console.log('Payment successful');
            return 'Paid';
        } else {
            console.log('Payment not completed');
            return 'Pending';
        }
    } catch (error) {
        console.error('Error capturing payment:', error);
        return 'Pending';
    }
}


