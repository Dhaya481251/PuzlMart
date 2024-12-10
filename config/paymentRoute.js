//const Razorpay = require('razorpay');
//const crypto = require('crypto');
const axios = require('axios');
const User = require('../models/userSchema');
const Cart = require('../models/cartSchema');
const Product = require('../models/productSchema');



/*const razorpay = new Razorpay({
    key_id:process.env.RAZORPAY_KEY_ID,
    key_secret:process.env.RAZORPAY_SECRET
});*/

async function generateAccessToken(){
    try{
    const response = await axios({
        url:process.env.PAYPAL_BASE_URL + '/v1/oauth2/token',
        method:'POST',
        data:'grant_type=client_credentials',
        auth:{
            username:process.env.PAYPAL_CLIENT_ID,
            password:process.env.PAYPAL_SECRET
        }
    })
    console.log('Access token generated : ',response.data.access_token);
    return response.data.access_token;
    }catch(error){
        console.error('Error generating access token : ',error.response?.data || error.message);
        throw new Error('Failed to generate paypal access token')
    }
}

exports.createOrder = async (userId) => {

try{
    
    const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            throw new Error('Cart is empty');
        }

        const purchaseUnits = cart.items.map((item) => ({
            name: item.productId.productName,
            description: item.productId.description || 'No description provided',
            quantity: item.quantity,
            unit_amount: {
                currency_code: 'USD',
                value: item.productId.salePrice.toFixed(2),
            },
        }));

        const finalAmount = cart.items.reduce(
            (total, item) => total + item.productId.salePrice * item.quantity,0);
    const accessToken = await generateAccessToken();
    const response = await axios({
        url:process.env.PAYPAL_BASE_URL + '/v2/checkout/orders',
        method:'POST',
        headers:{
            'Content-Type':'application/json',
            'Authorization':'Bearer '+ accessToken
        },
        data:{
            intent:'CAPTURE',
            purchase_units:[
                {
                    amount:{
                        currency_code:'USD',
                        value:finalAmount.toFixed(2),
                        breakdown:{
                            item_total:{
                                currency_code:'USD',
                                value:finalAmount.toFixed(2)
                            }
                        }
                    },
                    items:purchaseUnits,
                }
            ],
            application_context:{
                return_url:'http://localhost:3000/orderConfirmation',
                cancel_url:'http://localhost:3000/cart',
                shipping_preference:'NO_SHIPPING',
                user_action:'PAY_NOW',
                brand_name:'Puzl Mart'
            }
        }
    })
    console.log('Paypal order created :',response.data.id);
    const approvalLink = response.data.links.find((link) => link.rel === 'approve');
        if (!approvalLink) {
            throw new Error('Approval link not found in PayPal response');
        }
        return approvalLink.href;
}catch(error){
    console.error('Error creating paypal order : ',error);
    throw new Error('Failed to create PayPal order');
}
}



