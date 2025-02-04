const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Cart = require('../../models/cartSchema')
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const Wishlist = require('../../models/wishlistSchema');
const mongoose = require('mongoose');
const env = require('dotenv').config();
const payment = require('../../config/paymentRoute');





const loadCheckOutPage = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        const wishlist = await Wishlist.findOne({userId}).populate('products.productsId');
        const category = await Category.find({isListed:true})
        if (cart && cart.items) {
            cart.items = cart.items.filter(item => item.productId); // Remove items with null productId
        }
        if(cart.items.length<0){
            res.redirect('/');
        }
        const addressData = await Address.findOne({ userId: userData._id }) || { address: [] };
        const coupons = await Coupon.find({ isActive: true });

        let finalAmount = cart.items.reduce((total, item) => {
            return total + (item.productId?.salePrice || 0) * item.quantity;
        }, 0);
        let discount = cart.items.reduce((acc, item) => {
            return acc + ((item.productId?.regularPrice || 0) - (item.productId?.salePrice || 0)) * item.quantity;
        }, 0);
        
        // Apply coupon if active
        if (coupons && new Date() <= coupons.expireOn) {
            if (coupons.discountType === 'Percentage') {
                const couponDiscount = finalAmount * (coupons.discount / 100);
                finalAmount -= couponDiscount;
                discount += couponDiscount;
            } else {
                finalAmount = Math.max(0, finalAmount - coupons.discount);
                discount += coupons.discount;
            }
            userData.coupons.isActive = true;
            await userData.save();
        }

        res.render('orderPaymentPage', {
            isAuthenticated: req.isAuthenticated(),
            user: userData,
            cart,
            userAddress: addressData,
            coupons,
            finalAmount,
            discount,
            wishlist,
            category:category
        });
    } catch (error) {
        console.error('Checkout page error:', error);
        res.status(500).send('Internal Server Error');
    }
};


const orderPlaced = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const { selectedAddress, selectedPayment } = req.body;
        const coupon = await Coupon.findOne({ code: req.session.couponCode });
       
        if (!selectedAddress || !selectedPayment) {
            return res.status(400).send('Address and payment method are required');
        }

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (cart && cart.items) {
            cart.items = cart.items.filter(item => item.productId && item.productId.productName && item.productId.salePrice); // Filter out items with missing details
        }
        const wishlist = await Wishlist.findOne({userId}).populate('products.productsId');
        // Log details of each product in the cart
        cart.items.forEach(item => {
            const product = item.productId;
            console.log(`Product ID: ${item._id}, Product Name: ${product?.productName}, Sale Price: ${product?.salePrice}, Description: ${product?.description}`);
        });

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

        let finalAmount = cart.items.reduce((total, item) => total + (item.productId?.salePrice || 0) * item.quantity, 0);
        let discount = cart.items.reduce((acc, item) => acc + ((item.productId?.regularPrice || 0) - (item.productId?.salePrice || 0)) * item.quantity, 0);
        let couponDiscount = 0;

        if (coupon && new Date() <= coupon.expireOn) {
            if (coupon.discountType === 'Percentage') {
                couponDiscount = finalAmount * (coupon.discount / 100);
                finalAmount -= couponDiscount;
                discount += couponDiscount;
            } else {
                couponDiscount = coupon.discount;
                finalAmount = Math.max(0, finalAmount - coupon.discount);
                discount += coupon.discount;
            }
            userData.coupons.isActive = true;
            await userData.save();
        }

        const orderData = new Order({
            userId,
            deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            items: cart.items,
            finalAmount,
            discount,
            addressId: orderAddress,
            paymentMethod: selectedPayment,
            status: 'Pending',
            createdOn: new Date(),
        });
        orderData.addressDetails = orderAddress;
        orderData.couponApplied = coupon && new Date() <= coupon.expireOn;

        for (const item of cart.items) {
            const product = await Product.findById(item.productId);
            if (product) {
                if (product.quantity >= item.quantity) {
                    product.quantity -= item.quantity;
                    await product.save();
                } else {
                    return res.status(400).send('Out of stock');
                }
            } else {
                return res.status(404).send('Product not found');
            }
        }

        if (selectedPayment === 'PayPal') {
            const url = await payment.createOrder(userId, couponDiscount);
            orderData.paymentStatus = 'Paid';
            await orderData.save();
            cart.items = [];
            await cart.save();
            return res.redirect(url);
        } else if (selectedPayment === 'COD') {
            const order = new Order(orderData);
            order.paymentStatus = 'Not paid';
            await order.save();
            cart.items = [];
            await cart.save();
            return res.render('orderConfirmation', { cart,wishlist });
        } else {
            return res.status(400).send('Invalid payment method');
        }
    } catch (error) {
        console.error('Order placed error:', error);
        res.status(500).send('Internal Server Error');
    }
};

const orderConfirmation = async(req,res) => {
    try {
        const userId = req.session.user;
        const id = req.params.id;
        const order = await Order.findById(id);
        const cart = await Cart.findOne({userId}).populate('items.productId');
        const wishlist = await Wishlist.findOne({userId}).populate('products.productsId');
        const category = await Category.find({isListed:true});
        res.render(`orderConfirmation`,{order,cart,wishlist,category:category});
        
    } catch (error) {
        
    }
}

const loadMyOrdersPage = async (req, res) => {
    try {
        const userId = req.session.user;
        const user = await User.findOne({ _id: userId }); 
        if (!user) { 
            return res.status(404).send('User not found');
        }
        const cart = await Cart.findOne({userId}).populate('items.productId');
        const wishlist = await Wishlist.findOne({userId}).populate('products.productsId');
        console.log('User ID from session:', userId);
        const category = await Category.find({isListed:true});
        const orders = await Order.find({userId})
        .populate('items.productId')
        .populate('userId')
        .sort({createdOn:-1});

        console.log('Fetched Orders:', orders);
        console.log('Address : ',orders.address);
        
        res.render('myOrders', { orders ,user,cart,wishlist,category:category});
    } catch (error) {
        console.error('Error while loading my orders:', error);
        res.status(500).send('Internal server error');
    }
};


const orderDetails = async(req,res) => {
    try{
        const userId = req.session.user;
        
        
        const id = req.params.id;
        const order = await Order.findById({_id:id})
        .populate('items.productId')
        .populate('userId');

        if(!order){
        return  res.status(404).send('Order not found');
        }
        const cart = await Cart.findOne({userId}).populate('items.productId');
        const wishlist = await Wishlist.findOne({userId}).populate('products.productsId');
        console.log('Order : ',order);
        const category = await Category.find({isListed:true});
        
        res.render('orderDetails',{orders:order,cart,wishlist,category:category});
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
        const cart = await Cart.findOne({userId}).populate('items.productId');
        const wishlist = await Wishlist.findOne({userId}).populate('products.productsId');
        const category = await Category.find({isListed:true});
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

        const product = await Product.findByIdAndUpdate(
            productId,{
                $push:{
                    reviews:{
                        userId,
                        review,
                        rating
                    }
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
        const cart = await Cart.findOne({user}).populate('items.productId');
        const wishlist = await Wishlist.findOne({user}).populate('products.productsId');
        const category = await Category.find({isListed:true});
        res.render('orderAddAddress',{user:user,cart,wishlist,category:category});
       
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
};

const addAddress = async(req,res) => {
    try {
        const userId = req.session.user;
        const cart = await Cart.findOne({userId}).populate('items.productId');
        const wishlist = await Wishlist.findOne({userId}).populate('products.productsId');
        const category = await Category.find({isListed:true});
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
        req.session.cart = cart;
        req.session.wishlist = wishlist;
        res.redirect('/buyNow',{category:category});
    } catch (error) {
        console.error('Error adding address',error);
        res.status(500).send('Internal server error');
    }
}

const loadEditAddress = async(req,res) => {
    try {
        const addressId = req.query.id;
        const user = req.session.user;
        const cart = await Cart.findOne({user}).populate('items.productId');
        const wishlist = await Wishlist.findOne({user}).populate('products.productsId');
        const category = await Category.find({isListed:true});
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

        res.render('orderEditAddress',{address:addressData,user:user,cart,wishlist,category:category});
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
        const cart = await Cart.findOne({user}).populate('items.productId');
        const wishlist = await Wishlist.findOne({user}).populate('products.productsId');
        const category = await Category.find({isListed:true});
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

        res.redirect('/buyNow',{cart,wishlist,category:category});
    } catch (error) {
        console.error('editing error',error);
        res.status(500).send('Internal server error');
    }
}

const cancelOrder = async(req,res) => {
    try {
        const id = req.params.id;
        const userId = req.session.user;
        const user = await User.findById(userId);
        const cart = await Cart.findOne({userId}).populate('items.productId');
        const wishlist = await Wishlist.findOne({userId}).populate('products.productsId');
        const category = await Category.find({isListed:true});
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
            order.paymentStatus = 'Not paid';
        }
        
        await order.save();

        
        if(order.paymentStatus === 'Paid'){
            const userId = req.session.user;
            const user = await User.findById(userId);

            user.wallet.balance = user.wallet.balance + order.finalAmount || 0;
            const newTransaction = {
                transactionsType : 'credit',
                amount : order.finalAmount,
                reason : 'Order cancellation refund',
                date : new Date()
            };
            user.wallet.transactions.push(newTransaction);
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
        const userId = req.session.user;
        const cart = await Cart.findOne({userId}).populate('items.productId');
        const wishlist = await Wishlist.findOne({userId}).populate('products.productsId');
        const category = await Category.find({isListed:true});
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

const applyCoupon = async(req,res) => {
    try{
        console.log('Coupon code : ',req.body);
        const {couponCode} = req.body;
        const userId = req.session.user;
        
        const coupon = await Coupon.findOne({code:couponCode,isActive:true});
    
        if(!coupon){
            return res.status(404).json({message:'Coupon not found'});
        }

        const currentDate = new Date();
        if(currentDate > coupon.expireOn){
            return res.status(400).json({message:'Coupon has expired'});
        }
        
        const user = await User.findById(userId);
        
        if(user.coupons.includes(coupon._id)){
            return res.status(400).json({message:'Coupon already added'});
        }
        
        const cart = await Cart.findOne({userId}).populate('items.productId');
        if (cart && cart.items) {
            cart.items = cart.items.filter(item => item.productId); // Remove items with null productId
          }
        const cartTotal = cart.items.reduce((total,item) => total + item.productId.salePrice*item.quantity,0);
        
        const wishlist = await Wishlist.findOne({userId}).populate('products.productsId');
        const category = await Category.find({isListed:true});
        if(coupon.minimumPrice && cartTotal < coupon.minimumPrice){
            return res.status(400).json({message : `Coupon requires a minimum price of ${coupon.minimumPrice}`})
        }
        // user.coupons = coupon._id;
        // user.coupons.isActive = true;
        let discountAmount = 0;
        if (coupon.discountType === 'Percentage') {
            discountAmount = (cartTotal * coupon.discount) / 100;
        } else {
            discountAmount = coupon.discount;
        }

        const finalAmount = cartTotal - discountAmount;
        user.coupons.push(coupon._id);
        
        coupon.usedCount += 1 ;
        await user.save();
        await coupon.save();
        req.session.couponCode = couponCode
        
        res.status(200).json({message:'Coupon added successfully',couponDetails:{name:coupon.name,type:coupon.discountType,discount:coupon.discount,discountAmount:discountAmount,finalAmount:finalAmount}});

    }catch (error) {
        console.error('Error adding coupons : ',error);
        res.status(500).json({error:'Internal Serve Error'});
    }
}

const removeCoupon = async(req,res) => {
    try {
        const userId = req.session.user;
        const user = await User.findById(userId);

        if(!user){
            return res.status(404).json({message:'User not found'});
        }

        const couponCode = req.session.couponCode;
        const coupon = await Coupon.findOne({code:couponCode});

        if(!coupon){
            return res.status(404).json({message:'Coupon not found'});
        }

        user.coupons = user.coupons.filter(c => c.toString()!==coupon._id.toString());
        await user.save();
        
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (cart && cart.items) {
            cart.items = cart.items.filter(item => item.productId); // Remove items with null productId
          }

        const wishlist = await Wishlist.findOne({userId}).populate('products.productsId');
        const category = await Category.find({isListed:true});
        const cartTotal = cart.items.reduce((total, item) => 
            total + item.productId.salePrice * item.quantity, 0
        );
        const originalDiscount = cart.items.reduce((acc, item) => 
            acc + (item.productId.regularPrice - item.productId.salePrice) * item.quantity, 0
        );

        req.session.couponCode = null;
        res.status(200).json({message:'Coupon removed successfully',updatedPrices:{total:cartTotal,discount:originalDiscount,final:cartTotal}});
    } catch (error) {
        console.error('Error removing coupon : ',error);
        res.status(500).json({message:'Internal Server Error'});
    }
}

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