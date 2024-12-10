const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Cart = require('../../models/cartSchema')
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const mongoose = require('mongoose');
const env = require('dotenv').config();
const payment = require('../../config/paymentRoute');
/*const crypto = require('crypto');
const razorpay = require('razorpay');
const paypal = require('paypal');*/



const loadCheckOutPage = async(req,res) => {
    try {
        
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const cart = await Cart.findOne({userId}).populate('items.productId') || {items:[]};
        const addressData = await Address.findOne({userId:userData._id}) || {address:[]};
        const coupons = await Coupon.findOne({userId,isList:true});

        res.render('orderPaymentPage',{isAuthenticated:req.isAuthenticated(),user:userData,cart,userAddress:addressData,coupons});
    } catch (error) {
        console.error('Check out page error',error);
        res.status(500).send('Internal Server Error');
    }
}

const orderPlaced = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const { selectedAddress, selectedPayment } = req.body;
        
        
        if (!selectedAddress || !selectedPayment) {
            return res.status(400).send('Address and payment method are required');
        }
        
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.status(400).send('Your cart is empty');
        }

        //const coupon = req.session.coupon

        console.log('selectedAddress ID : ',selectedAddress);
        const userAddresses = await Address.findOne({ userId });
        if (!userAddresses) {
            return res.status(404).send('No addresses found for the user');
        }

        const orderAddress = userAddresses?.address.find(
            (addr) => addr._id.toString() === selectedAddress
        );

        if (!orderAddress) {
            return res.status(404).send('Address not found');
        }

        console.log('Order Address:', orderAddress);

        const finalAmount = Number( cart.items.reduce((total, item) => total + item.productId.salePrice*item.quantity, 0) ); 
        let discount = cart.items.reduce((acc, item) => acc + (item.productId.regularPrice - item.productId.salePrice) * item.quantity, 0);

       /*if(coupon.discount){
            discount += coupon.discount;
            finalAmount -= coupon.discount;
        }*/
        const orderData = new Order({
            userId,
            deliveryDate:new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            items: cart.items,
            finalAmount, 
            discount,
            addressId: orderAddress,
            paymentMethod: selectedPayment,
            status: 'Pending',
            createdOn: new Date(),
        });
        orderData.addressDetails = orderAddress;
        console.log('Address in order : ',orderData.address);
        for(const item of cart.items){
            const product = await Product.findById(item.productId);
            if(product){
                if(product.quantity >= item.quantity){
                    product.quantity -= item.quantity;
                    await product.save();
                }else{
                    return res.status(400).send('Out of stock')
                }
            }else{
                return res.status(404).send('Product not found');
            }
        }
        
        if(selectedPayment === 'PayPal'){
            const url = await payment.createOrder(userId);
            orderData.paymentStatus = 'Paid'
            await orderData.save();
            cart.items = [];
           await cart.save();
            return res.redirect(url);
        }else if(selectedPayment === 'razorpay'){
            const instance = new razorpay({
                key_id:process.env.RAZORPAY_KEY_ID,
                key_secret:process.env.RAZORPAY_SECRET
            });

            const options = {
                amount:finalAmount*100,
                currency:'INR',
                receipt:`receipt_${Date.now()}`
            };

            const razorpayOrder = await instance.orders.create(options);
            orderData.paymentMethod = 'Razorpay';
            orderData.razorpayOrderId = razorpayOrder.id;
            orderData.paymentStatus = 'Paid';
            const order = new Order(orderData);
            await order.save();

            return res.json({razorpayOrderId:razorpayOrder.id});
        } else if(selectedPayment === 'COD'){
           
           const order = new Order(orderData);
           order.paymentStatus = 'Not paid'
           await order.save();
           
           cart.items = [];
           await cart.save();
           res.render('orderConfirmation');
        }else{
           return res.status(400).send('Invalid payment method')
        }
    } catch (error) {
        console.error('Order placed error: ', error);
        res.status(500).send('Internal Server Error');
    }
};


const orderConfirmation = async(req,res) => {
    try {
        const id = req.params.id;
        const order = await Order.findById(id);
        res.render(`orderConfirmation`,{order});
    } catch (error) {
        
    }
}

const loadMyOrdersPage = async (req, res) => {
    try {
        const userId = req.session.user;
        console.log('User ID from session:', userId);

        const orders = await Order.find({userId})
        .populate('items.productId')
        .populate('userId');
        
         

        console.log('Fetched Orders:', orders);
        console.log('Address : ',orders.address);
       
        
        

        res.render('myOrders', { orders });
    } catch (error) {
        console.error('Error while loading my orders:', error);
        res.status(500).send('Internal server error');
    }
};


const orderDetails = async(req,res) => {
    try{
        const userId = req.session.user;
        const id = req.params.id;
        const order = await Order.findById(id)
        .populate('items.productId')
        .populate('userId');

        if(!order){
        return  res.status(404).send('Order not found');
        }

        console.log('Order : ',order);
       
        
        res.render('orderDetails',{orders:order});
    }catch(error){
        console.error('error while loading order details',error);
        res.status(500).send('Internal server error');
    }
}

const rateProduct = async(req,res) => {
    try {
        const {orderId,productId} = req.params;
        const {rating,review} = req.body;
        const userId = req.session.user;
        
        console.log('Rating and review',req.body)
        if(isNaN(rating) || rating<1 || rating>5){
            return res.status(400).json({message:'Invalid rating. Rating should be a number between 1 and 5.',type:'error'});
        }

        console.log('Order ID : ',orderId);
        console.log('Product ID : ',productId);
        const order = await Order.findOneAndUpdate(
            {_id:orderId,'items.productId':productId},
            {$set:{
                'items.$.rating':rating,
                'items.$.review':review
            }},{new:true}
        )
        if(!order){
            return res.status(404).json({message:'Order or product not found'});
        }

        const product = await Product.findById(productId);
        product.findOneAndUpdate(
            {},{
                $set:{
                    'reviews.userId':userId,
                    'reviews.review':review,
                    'reviews.rating':rating,
                    
                }
            }
        );

        await product.save();

        if(product){
            const currentAverageRating = product.averageRating || 0;
            const currentTotalReviews = product.totalReviews || 0;

            const totalRating = currentAverageRating * currentTotalReviews + parseFloat(rating);
            const newTotalReviews = currentTotalReviews + 1;

            product.averageRating = totalRating / newTotalReviews;
            product.totalReviews = newTotalReviews;

            await product.save();

        }
       

        res.status(200).json({message:'Rating and review added successfully',type:'success'});
    } catch (error) {
        console.error('rating and review added error',error);
        res.status(500).json({message:'Internal server error',type:'error'});
    }
}

const loadAddAddress = async (req, res) => {
    try {
        const user = req.session.user;

        res.render('orderAddAddress',{user:user});
       
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
};

const addAddress = async(req,res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findOne({_id:userId});
        const {addressType,name,city,landMark,state,pincode,phone,altPhone} = req.body;

        const userAddress = await Address.findOne({userId:userData._id});
        if(!userAddress){
            const newAddress = new Address({
                userId:userData._id,
                address:[{addressType,name,city,landMark,state,pincode,phone,altPhone,}]
            });
            await newAddress.save();
        }else{
            userAddress.address.push({addressType,name,city,landMark,state,pincode,phone,altPhone});
            await userAddress.save();
        }
        res.redirect('/buyNow')
    } catch (error) {
        console.error('Error adding address',error);
        res.status(500).send('Internal server error');
    }
}

const loadEditAddress = async(req,res) => {
    try {
        const addressId = req.query.id;
        const user = req.session.user;
        const currentAddress = await Address.findOne({'address._id':addressId});
        if(!currentAddress){
            return res.status(404).send('Address not found');
        }

        const addressData = currentAddress.address.find((item) => {
            return item._id.toString()===addressId.toString();
        })

        if(!addressData){
            return res.status(404).send('Address not found');
        }

        res.render('orderEditAddress',{address:addressData,user:user});
    } catch (error) {
        console.error('editpage error',error);
        res.status(500).send('Internal server error');
    }
}

const editAddress = async(req,res) => {
    try {
        const data = req.body;
        const addressId = req.query.id;
        const user = req.session.user;
        const findAddress = await Address.findOne({'address._id':addressId});
        
        if(!findAddress){
            res.status(404).send('Address not found');
        }

        await Address.updateOne(
            {'address._id':addressId},
            {$set:{
                'address.$':{
                    _id:addressId,
                    addressType:data.addressType,
                    name:data.name,
                    city:data.city,
                    landMark:data.landMark,
                    state:data.state,
                    pincode:data.pincode,
                    phone:data.phone,
                    altPhone:data.altPhone
                }
            }}
        )

        res.redirect('/buyNow');
    } catch (error) {
        console.error('editing error',error);
        res.status(500).send('Internal server error');
    }
}

const cancelOrder = async(req,res) => {
    try {
        const id = req.params.id;
        const {cancellationReason} = req.body;
        const order = await Order.findOneAndUpdate(
            {_id:id},
            {$set:
                {cancellationReason}
            },{new:true}
        );
        if(!order){
            return res.status(404).send('Order not found');
        }

        if(order.status!=='Pending'){
            return res.status(400).json({message:'Order cannot be cancelled.',type:'error'})
        }

        order.status ="Cancelled";
        if(order.paymentMethod==='PayPal'){
            order.paymentStatus='Paid';
        }else{
            order.paymentStatus = 'Not paid'
        }
        
        await order.save();

        
        if(order.paymentStatus === 'Paid'){
            const userId = req.session.user;
            const user = await User.findById(userId);

            
              
            user.wallet.balance = user.wallet.balance + order.finalAmount || 0;
            await user.save()
            console.log('order is cancelled');
            res.status(200).json({message:'Order cancelled and refund credited in wallet successfully',type:'success'});
        }else{
        console.log('order is cancelled');
        res.status(200).json({message:'Order cancelled successfully',type:'success'});
        }
    }catch(error){
        console.log('order cancelling error',error);
        res.status(500).json({message:'Internal server error',type:'error'});
    }
}

const returnOrder = async(req,res) => {
    try {
        const id = req.params.id;
        const {returnReason} = req.body;
        const order = await Order.findOneAndUpdate(
            {_id:id},
            {$set:
                {returnReason}
            },{new:true}
        );
        if(!order){
            return res.status(404).send('Order not found');
        }

        
        if(order.status!=='Delivered'){
            return res.status(400).json({message:'Order cannot be returned.',type:'error'})
        }

        order.status ="Returned";
        await order.save();
        console.log('order is returned');
        res.status(200).json({message:'Order returned successfully',type:'success'});
    }catch(error){
        console.log('order returning error',error);
        res.status(500).json({message:'Internal server error',type:'error'});
    }
}

const applyCoupon = async (req, res) => {
    try {
        const { couponCode } = req.body;
        const userId = req.session.user;

        console.log('Received couponcode : ',couponCode);

        const coupon = await Coupon.findOne({ name: couponCode });

        if (!coupon) {
            return res.status(400).json({ message: 'Invalid coupon code' });
        }

        let discount = 0;
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        
        if (coupon.discountType === 'percentage') {
            discount = (totalAmount * coupon.discount)/100;
        } else if (coupon.discountType === 'fixed') {
            discount = coupon.discount;
        }

        req.session.coupon = { code: couponCode, discount }; 
        
        res.json({ success: true, coupon, discount });
    } catch (error) {
        console.error('Error applying coupon:', error);
        res.status(500).send('Internal server error');
    }
};


const removeCoupon = async (req, res) => {
    try {
        
        req.session.coupon = null;
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error removing coupon:', error);
        res.status(500).send('Internal server error');
    }
};


module.exports = {
    loadCheckOutPage,
    orderPlaced,
    orderConfirmation,
    loadMyOrdersPage,
    orderDetails,
    rateProduct,
    loadAddAddress,
    addAddress,
    loadEditAddress,
    editAddress,
    cancelOrder,
    returnOrder,
    applyCoupon,
    removeCoupon
}