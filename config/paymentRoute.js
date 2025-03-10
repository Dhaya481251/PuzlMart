const axios = require('axios');
const Cart = require('../models/cartSchema');
const User = require('../models/userSchema');
const Product = require('../models/productSchema');
const Order = require('../models/orderSchema');

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
        return (amountInINR * conversionRate).toFixed(2); // Convert and format to 2 decimal places
    } catch (error) {
        console.error('Error converting currency: ', error.message);
        throw new Error('Failed to convert INR to USD');
    }
}


const capturePayment = async (paypalOrderId,orderId,accessToken) => {
    try {
         // Regenerate the access token
        const response = await axios({
            url: `${process.env.PAYPAL_BASE_URL}/v2/checkout/orders/${paypalOrderId}/capture`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
        });
        console.log('OrderId : ',orderId);
        console.log('Paypal Order Id : ',paypalOrderId);
        console.log('Capture payment status : ',response.data.status);
        console.log('Capture Payment Response:', response.data);

        if (response.data.status === 'COMPLETED') {
            console.log('Payment successful');
            await Order.findByIdAndUpdate({_id:orderId}, { paymentStatus: 'Paid' },{new:true});
            return 'Paid';
        } else {
            console.log('Payment not completed');
            await Order.findByIdAndUpdate({_id:orderId}, { paymentStatus: 'Pending'},{new:true});
            return 'Pending';
        }
    } catch (error) {
        console.error('Error capturing payment:', error);
        await Order.findByIdAndUpdate({_id:orderId}, { paymentStatus: 'Pending' },{new:true});
        return 'Pending';
    }
};


exports.createOrder = async (userId, couponDiscount = 0,orderId) => {
    try {
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            throw new Error('Cart is empty');
        }

        const validItems = cart.items.filter(item => {
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

        const discountUSD = await convertCurrency(couponDiscount);
        const finalAmountUSD = (itemTotalUSD - discountUSD).toFixed(2);
        console.log('itemTotalUSD:', itemTotalUSD.toFixed(2));
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
                    return_url: 'http://localhost:3000/orderConfirmation',
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
        
        await capturePayment(response.data.id,orderId,accessToken);
        await Order.findByIdAndUpdate({_id:orderId},{paypalOrderId:response.data.id});
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




