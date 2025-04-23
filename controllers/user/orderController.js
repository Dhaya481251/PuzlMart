const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const Coupon = require("../../models/couponSchema");
const Wishlist = require("../../models/wishlistSchema");
const Notification = require("../../models/notificationSchema");
const Review = require("../../models/reviewSchema");

const mongoose = require("mongoose");
const env = require("dotenv").config();
const payment = require("../../config/paymentRoute");
const startPayPal = require("../../config/startPayPal");
const PDFDocument = require("pdfkit");
const axios = require("axios");

const {StatusCodes,ReasonPhrases} = require('http-status-codes');

async function convertCurrency(amountInINR) {
  try {
    const response = await axios.get(
      `https://api.exchangerate-api.com/v4/latest/INR`
    );
    const conversionRate = response.data.rates.USD;
    return (amountInINR * conversionRate).toFixed(2); 
  } catch (error) {
    throw new Error("Failed to convert INR to USD");
  }
}

const loadCheckOutPage = async (req, res) => {
  try {
    const userId = req.session.user;
    let search = req.body.query || "";
    const userData = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate("products.productsId");
    const category = await Category.find({ isListed: true });
    
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.redirect(StatusCodes.MOVED_TEMPORARILY, "/products");
    }
    cart.items = cart.items.filter(item => !item.productId.isBlocked);

    if (cart.items.length === 0) {
      return res.redirect(StatusCodes.MOVED_TEMPORARILY, "/products");
    }

    const addressData = (await Address.findOne({ userId: userData._id })) || {
      address: [],
    };
    const coupons = await Coupon.find({ isActive: true });

    let deliveryCharge = 20; // Fixed delivery charge
    const cartTotal = cart.items.reduce((total, item) => {
      return total + (item.productId.salePrice || 0) * item.quantity;
    }, 0);

    // Base discount logic for the cart
    let discount = cart.items.reduce((acc, item) => {
      return (
        acc +
        ((item.productId.regularPrice || 0) -
          (item.productId.salePrice || 0)) *
          item.quantity
      );
    }, 0);

    // If a coupon is applied
    const couponCode = req.session.couponCode;
    let couponDiscount = 0;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode });
      if (coupon && new Date() <= coupon.expireOn) {
        if (coupon.discountType === "Percentage") {
          couponDiscount = cartTotal * (coupon.discount / 100);
        } else {
          couponDiscount = coupon.discount;
        }
        discount += couponDiscount;
      }
    }

    
    const finalAmount = Math.max(0, cartTotal - couponDiscount + deliveryCharge);
    const finalAmountInUSD = await convertCurrency(finalAmount)
    res.render("orderPaymentPage", {
      user: userData,
      cart,
      userAddress: addressData,
      coupons,
      finalAmount: parseFloat(finalAmount.toFixed(2)), // Ensure two-decimal precision
      discount: parseFloat(discount.toFixed(2)),
      deliveryCharge,
      wishlist,
      category,
      coupon: couponCode ? await Coupon.findOne({ code: couponCode }) : null,
      finalAmountInUSD,
      appliedFilters:{query:search}
    });
  } catch (error) {
    console.error("Error in loadCheckOutPage:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

const orderPlaced = async (req, res) => {
  try {
    const userId = req.session.user;
    let search = req.body.query || "";
    const userData = await User.findById(userId);
    const { selectedAddress, selectedPayment } = req.body;
    const coupon = await Coupon.findOne({ code: req.session.couponCode });
    const category = await Category.find({ isListed: true });
    if (!selectedAddress || !selectedPayment) {
      return res.status(StatusCodes.BAD_REQUEST).send("Address and payment method are required");
    }

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).send("Cart is empty");
    }
    cart.items = cart.items.filter(item => !item.productId.isBlocked);

    if (cart.items.length === 0) {
      return res.redirect(StatusCodes.BAD_REQUEST).send('product is blocked')
    }
    const wishlist = await Wishlist.findOne({ userId }).populate(
            "products.productsId"
    );
    const userAddresses = await Address.findOne({ userId });
    if (!userAddresses) {
      return res.status(StatusCodes.NOT_FOUND).send("No addresses found for the user");
    }

    const orderAddress = userAddresses.address.find(
      (addr) => addr._id.toString() === selectedAddress
    );
    if (!orderAddress) {
      return res.status(StatusCodes.NOT_FOUND).send("Address not found");
    }

    const deliveryCharge = 20;
    const cartTotal = cart.items.reduce(
      (total, item) =>
        total + (item.productId?.salePrice || 0) * item.quantity,
      0
    );

    let discount = cart.items.reduce(
      (acc, item) =>
        acc +
        ((item.productId?.regularPrice || 0) -
          (item.productId?.salePrice || 0)) *
          item.quantity,
      0
    );

    let couponDiscount = 0;
    if (coupon && new Date() <= coupon.expireOn) {
      if (coupon.discountType === "Percentage") {
        couponDiscount = cartTotal * (coupon.discount / 100);
      } else {
        couponDiscount = coupon.discount;
      }
      discount += couponDiscount;
    }

    const finalAmount = Math.max(
      0,
      cartTotal - couponDiscount + deliveryCharge
    );

    const orderData = new Order({
      userId,
      deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 
      items: cart.items.map((item) => ({
        productId: item.productId,
        salePrice: item.productId.salePrice,
        regularPrice: item.productId.regularPrice,
        quantity: item.quantity,
      })),
      finalAmount: parseFloat(finalAmount.toFixed(2)),
      discount: parseFloat(discount.toFixed(2)),
      deliveryCharge,
      addressId: orderAddress,
      paymentMethod: selectedPayment,
      status: "Pending",
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
          return res.status(StatusCodes.BAD_REQUEST).send("Out of stock");
        }
      } else {
        return res.status(StatusCodes.NOT_FOUND).send("Product not found");
      }
    }

    await orderData.save();
    

    if (selectedPayment === "PayPal") {
      try {
        const url = await payment.createOrder(userId, couponDiscount);
        orderData.paypalOrderId = new URL(url).searchParams.get("token");
        await orderData.save();
        cart.items = [];
        await cart.save();
        return res.redirect(url);
      } catch (error) {
        console.error('Error while making payment using paypal : ',error);
        orderData.paymentStatus = "Pending";
        await orderData.save();
        return res
          .status(500)
          .send(
            "Failed to create PayPal order, status updated to payment pending"
          );
      }
    } else if (selectedPayment === "COD") {
      orderData.paymentStatus = "Not paid";
      await orderData.save();
      cart.items = [];
    await cart.save();
      return res.render("orderConfirmation", { cart, wishlist, category , appliedFilters:{query:search} });
    } else if (selectedPayment === "Wallet") {
      userData.wallet.balance = userData.wallet.balance - finalAmount || 0;
      const newTransaction = {
        transactionsType: "debit",
        amount: finalAmount,
        reason: "Order Payment",
        date: new Date(),
      };
      userData.wallet.transactions.push(newTransaction);
      await userData.save();
      orderData.paymentStatus = "Paid";
      await orderData.save();
      cart.items = [];
    await cart.save();
      return res.render("orderConfirmation", { cart, wishlist, category ,appliedFilters:{query:search}});
    } else {
      return res.status(StatusCodes.BAD_REQUEST).send("Invalid payment method");
    }
  } catch (error) {
    console.error("Error in orderPlaced:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

const orderConfirmation = async (req, res) => {
  try {
    const userId = req.session.user;
    const id = req.params.id;
    let search = req.body.query || "";
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });

    await payment.capturePayment(req.query.token);

    res.render(`orderConfirmation`, { cart, wishlist, category: category,appliedFilters:{query:search} });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

const paymentSuccessfull = async (req, res) => {
  try {
    const userId = req.session.user;
    let search = req.body.query || "";
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });

    await startPayPal.capturePayment(req.query.token);

    res.render(`paymentSuccessfull`, { cart, wishlist, category: category,appliedFilters:{query:search} });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

const loadMyOrdersPage = async (req, res) => {
  try {
    const userId = req.session.user;
    let search = req.body.query || "";
    const user = await User.findOne({ _id: userId });
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).send("User not found");
    }
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );

    const category = await Category.find({ isListed: true });

    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const orders = await Order.find({ userId })
      .populate("items.productId")
      .populate("userId")
      .sort({ createdOn: -1 })
      .skip(skip)
      .limit(limit);

    const totalOrders = await Order.countDocuments({ userId });
    const totalPages = Math.ceil(totalOrders / limit);

    res.render("myOrders", {
      orders,
      user,
      cart,
      wishlist,
      category: category,
      totalOrders: totalOrders,
      currentPage: page,
      totalPages: totalPages,
      appliedFilters:{query:search}
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal server error");
  }
};

const orderDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    let search = req.body.query || "";
    const id = req.params.id;
    const order = await Order.findById({ _id: id })
      .populate("items.productId")
      .populate("items.reviews")
      .populate("userId");
    const notifications = await Notification.find({ orderId: order._id });
    const reviews = await Review.find({ userId: userId });

    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).send("Order not found");
    }
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );

    const category = await Category.find({ isListed: true });

    res.render("orderDetails", {
      orders: order,
      cart,
      wishlist,
      category: category,
      notifications: notifications,
      reviews,
      appliedFilters:{query:search}
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal server error");
  }
};

const payFromOrderDetails = async (req, res) => {
  try {
    const id = req.params.id;

    const userId = req.session.user;
    const approvalUrl = await startPayPal.createOrder(userId, id);
    const order = await Order.findById({ _id: id });

    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).send("Order not found");
    }

    order.paypalOrderId = new URL(approvalUrl).searchParams.get("token");

    await order.save();

    return res.redirect(approvalUrl);
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

const rateProduct = async (req, res) => {
  try {
    const { orderId, productId } = req.params;
    const { rating, review } = req.body;
    const userId = req.session.user;
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });

    if (isNaN(rating) || rating < 1 || rating > 5) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Invalid rating. Rating should be a number between 1 and 5.",
        type: "error",
      });
    }

    const newReview = new Review({
      productId,
      userId,
      review,
      rating,
    });
    await newReview.save();
    const order = await Order.findOneAndUpdate(
      { _id: orderId, "items.productId": productId },
      {
        $set: {
          "items.$.reviews": newReview._id,
        },
      },
      { new: true }
    );
    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: "Order or product not found" });
    }

    const product = await Product.findByIdAndUpdate(
      productId,
      {
        $set: {
          reviews: newReview._id,
        },
      },
      { new: true }
    );

    if (product) {
      const currentAverageRating = product.averageRating || 0;
      const currentTotalReviews = product.totalReviews || 0;

      const totalRating =
        currentAverageRating * currentTotalReviews + parseFloat(rating);
      const newTotalReviews = currentTotalReviews + 1;

      product.averageRating = totalRating / newTotalReviews;
      product.totalReviews = newTotalReviews;

      await product.save();
    }

    res.status(StatusCodes.OK).json({
      message: "Rating and review added successfully",
      type: "success",
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Internal server error", type: "error" });
  }
};

const loadAddAddress = async (req, res) => {
  try {
    const user = req.session.user;
    let search = req.body.query || "";
    const cart = await Cart.findOne({ user }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ user }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });
    const coupon = await Coupon.findOne({ code: req.session.couponCode });
    res.render("orderAddAddress", {
      user: user,
      cart,
      wishlist,
      category: category,
      coupon,
      appliedFilters:{query:search}
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

const addAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    let search = req.body.query || "";
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });
    const coupon = await Coupon.findOne({ code: req.session.couponCode });
    const userData = await User.findOne({ _id: userId });
    const {
      addressType,
      name,
      city,
      landMark,
      state,
      pincode,
      phone,
      altPhone,
    } = req.body;

    const userAddress = await Address.findOne({ userId: userData._id });
    if (!userAddress) {
      const newAddress = new Address({
        userId: userData._id,
        address: [
          {
            addressType,
            name,
            city,
            landMark,
            state,
            pincode,
            phone,
            altPhone,
          },
        ],
      });
      await newAddress.save();
    } else {
      userAddress.address.push({
        addressType,
        name,
        city,
        landMark,
        state,
        pincode,
        phone,
        altPhone,
      });
      await userAddress.save();
    }
    req.session.cart = cart;
    req.session.wishlist = wishlist;

    res.redirect(StatusCodes.MOVED_TEMPORARILY, "/buyNow");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal server error");
  }
};

const loadEditAddress = async (req, res) => {
  try {
    const addressId = req.query.id;
    let search = req.body.query || "";
    const user = req.session.user;
    const cart = await Cart.findOne({ user }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ user }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });
    const coupon = await Coupon.findOne({ code: req.sessioncouponCode });
    const currentAddress = await Address.findOne({ "address._id": addressId });
    if (!currentAddress) {
      return res.status(StatusCodes.NOT_FOUND).send("Address not found");
    }

    const addressData = currentAddress.address.find((item) => {
      return item._id.toString() === addressId.toString();
    });

    if (!addressData) {
      return res.status(StatusCodes.NOT_FOUND).send("Address not found");
    }

    res.render("orderEditAddress", {
      address: addressData,
      user: user,
      cart,
      wishlist,
      category: category,
      coupon,
      appliedFilters:{query:search}
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal server error");
  }
};

const editAddress = async (req, res) => {
  try {
    const data = req.body;
    let search = req.body.query || "";
    const addressId = req.query.id;
    const user = req.session.user;
    const cart = await Cart.findOne({ user }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ user }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });
    const findAddress = await Address.findOne({ "address._id": addressId });
    const coupon = await Coupon.findOne({ code: req.session.couponCode });
    if (!findAddress) {
      res.status(StatusCodes.NOT_FOUND).send("Address not found");
    }

    await Address.updateOne(
      { "address._id": addressId },
      {
        $set: {
          "address.$": {
            _id: addressId,
            addressType: data.addressType,
            name: data.name,
            city: data.city,
            landMark: data.landMark,
            state: data.state,
            pincode: data.pincode,
            phone: data.phone,
            altPhone: data.altPhone,
          },
        },
      }
    );

    req.session.cart = cart;
    req.session.wishlist = wishlist;
    res.redirect(StatusCodes.MOVED_TEMPORARILY, "/buyNow");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal server error");
  }
};

const cancelOrder = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.session.user;
    const user = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });
    const { cancellationReason } = req.body;
    const order = await Order.findOneAndUpdate(
      { _id: id },
      { $set: { cancellationReason } },
      { new: true }
    );
    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).send("Order not found");
    }

    if (order.status !== "Pending") {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Order cannot be cancelled.", type: "error" });
    }

    order.status = "Cancelled";

    await order.save();

    if (order.paymentStatus === "Paid") {
      const userId = req.session.user;
      const user = await User.findById(userId);

      user.wallet.balance = user.wallet.balance + order.finalAmount || 0;
      const newTransaction = {
        transactionsType: "credit",
        amount: order.finalAmount,
        reason: "Order cancellation refund",
        date: new Date(),
      };
      user.wallet.transactions.push(newTransaction);
      await user.save();

      res.status(StatusCodes.OK).json({
        message: "Order cancelled and refund credited in wallet successfully",
        type: "success",
      });
    } else {
      res
        .status(StatusCodes.OK)
        .json({ message: "Order cancelled successfully", type: "success" });
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Internal server error", type: "error" });
  }
};

const returnOrder = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.session.user;
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });
    const { returnReason } = req.body;
    const order = await Order.findOneAndUpdate(
      { _id: id },
      { $set: { returnReason } },
      { new: true }
    );
    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).send("Order not found");
    }

    if (order.status !== "Delivered") {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Order cannot be returned.", type: "error" });
    }

    const notification = new Notification({
      userId: order.userId,
      orderId: order._id,
      NotificationMesssage: `Return Request for order ${order._id}`,
      notificationType: "returnRequest",
    });

    await notification.save();

    res
      .status(StatusCodes.OK)
      .json({ message: "Return request sent to admin", type: "success" });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Internal server error", type: "error" });
  }
};

const applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const userId = req.session.user;

    const coupon = await Coupon.findOne({ code: couponCode, isActive: true });

    if (!coupon) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: "Coupon not found" });
    }

    const currentDate = new Date();
    if (currentDate > coupon.expireOn) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: "Coupon has expired" });
    }

    const user = await User.findById(userId);

    if (user.coupons.includes(coupon._id)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: "Coupon already added" });
    }

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (cart && cart.items) {
      cart.items = cart.items.filter((item) => item.productId);
    }
    const deliveryCharge = 20;
    const cartTotal = cart.items.reduce(
      (total, item) => total + item.productId.salePrice * item.quantity,
      0
    );

    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });
    if (coupon.minimumPrice && cartTotal < coupon.minimumPrice) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: `Coupon requires a minimum price of ${coupon.minimumPrice}`,
      });
    }
    let discountAmount = 0;
    if (coupon.discountType === "Percentage") {
      discountAmount = (cartTotal * coupon.discount) / 100;
    } else {
      discountAmount = coupon.discount;
    }

    const finalAmount = cartTotal + deliveryCharge - discountAmount;
    user.coupons.push(coupon._id);

    coupon.usedCount += 1;
    await user.save();
    await coupon.save();
    req.session.couponCode = couponCode;

    res.status(StatusCodes.OK).json({
      message: "Coupon added successfully",
      couponDetails: {
        name: coupon.name,
        type: coupon.discountType,
        discount: coupon.discount,
        discountAmount: discountAmount,
        finalAmount: finalAmount,
      },
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Serve Error" });
  }
};

const removeCoupon = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: "User not found" });
    }

    const couponCode = req.session.couponCode;
    const coupon = await Coupon.findOne({ code: couponCode });

    if (!coupon) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: "Coupon not found" });
    }

    user.coupons = user.coupons.filter(
      (c) => c.toString() !== coupon._id.toString()
    );
    await user.save();

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (cart && cart.items) {
      cart.items = cart.items.filter((item) => item.productId); 
    }

    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });
    const cartTotal = cart.items.reduce(
      (total, item) => total + item.productId.salePrice * item.quantity,
      0
    );
    const originalDiscount = cart.items.reduce(
      (acc, item) =>
        acc +
        (item.productId.regularPrice - item.productId.salePrice) *
          item.quantity,
      0
    );

    req.session.couponCode = null;
    res.status(StatusCodes.OK).json({
      message: "Coupon removed successfully",
      updatedPrices: {
        total: cartTotal,
        discount: originalDiscount,
        final: cartTotal,
      },
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Internal Server Error" });
  }
};

const downloadInvoice = async (req, res) => {
  try {
    const id = req.params.id;
    const order = await Order.findById(id)
      .populate("items.productId")
      .populate("userId")
      .exec();

    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).send("Order not found");
    }

    const address = order.addressDetails;
    if (!address) {
      return res.status(StatusCodes.NOT_FOUND).send("Address not found");
    }

    const doc = new PDFDocument({ autoFirstPage: false });
    doc.addPage();

    doc.fontSize(20).text("INVOICE", { align: "center" });
    doc.moveDown(1.5);

    doc
      .fontSize(12)
      .text(`Order ID : ${order.orderId}`, 50, 130, { align: "left" })
      .text(`Order Date : ${new Date(order.createdOn).toLocaleDateString()}`, {
        align: "left",
      })
      .moveUp()
      .text(`Invoice ID : INV-${order._id}`, 320, 130, { align: "right" })
      .text(
        `Invoice Date : ${new Date(order.invoiceDate).toLocaleDateString()}`,
        { align: "right" }
      );

    doc.moveDown();

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(3);

    doc.fontSize(10).font("Helvetica-Bold");
    doc.text("Seller Address : ", 50, 190);
    doc.font("Helvetica");
    doc.text("Puzl Mart, 123 Main Street, Bangalore, India", 50, 120);
    doc.text("support@puzlmart.com", 50, 220);
    doc.text("+1(123)456-456", 50, 230);

    doc.font("Helvetica-Bold");
    doc.text("Shipping Address:", 420, 190);
    doc.font("Helvetica");
    doc.text(`Name : ${order.addressDetails.name || "N/A"}`, 420, 210);
    doc.text(`City : ${order.addressDetails.city || "N/A"}`, 420, 220);
    doc.text(`State : ${order.addressDetails.state || "N/A"}`, 420, 230);
    doc.text(`Pincode : ${order.addressDetails.pincode || "N/A"}`, 420, 240);
    doc.text(`Land Mark : ${order.addressDetails.landMark || "N/A"}`, 420, 250);

    doc.moveTo(50, 300).lineTo(550, 300).stroke();
    doc.moveDown();

    const columnwidths = [150, 70, 70, 70, 70];
    const startX = 50;
    const rowHeight = 20;
    let tableY = doc.y + 40;

    const tableHeaders = [
      "Product Name",
      "Quantity",
      "Price",
      "Discount",
      "Subtotal",
    ];

    doc.fontSize(10).font("Helvetica-Bold");
    let currentX = startX;
    tableHeaders.forEach((header, index) => {
      doc.text(header, currentX - 40, tableY, {
        width: columnwidths[index],
        align: "center",
      });
      currentX += columnwidths[index];
    });

    doc
      .moveTo(startX, tableY + rowHeight - 5)
      .lineTo(
        startX + columnwidths.reduce((a, b) => a + b, 0),
        tableY + rowHeight - 5
      )
      .stroke();

    tableY += rowHeight;

    let subtotal = 0;

    if (order.status === "Returned" || order.status === "Return Request") {
      return;
    }

    order.items.forEach((item) => {
      const itemSubTotal = (item.salePrice || 0) * item.quantity;
      subtotal += itemSubTotal;

      const row = [
        item.productId.productName || "Unknown Product",
        item.quantity || 0,
        `Rs ${item.salePrice || 0}`,
        `Rs ${(item.regularPrice || 0) - (item.salePrice || 0)}`,
        `Rs ${itemSubTotal.toFixed(2)}`,
      ];

      currentX = startX - 40;
      row.forEach((value, index) => {
        doc.fontSize(10).font("Helvetica");
        doc.text(value, currentX, tableY, {
          width: columnwidths[index],
          align: "center",
        });
        currentX += columnwidths[index];
      });

      tableY += rowHeight;
    });

    tableY += 10;
    doc.moveTo(50, tableY).lineTo(550, tableY).stroke();
    tableY += 20;

    doc.fontSize(10).font("Helvetica-Bold");
    doc.text("Subtotal:", 350, tableY);
    doc.text(`Rs ${subtotal.toFixed(2)}`, 450, tableY);

    tableY += 20;
    doc.text("Delivery Charge:", 350, tableY);
    doc.text(`Rs ${order.deliveryCharge.toFixed(2)}`, 450, tableY);

    tableY += 20;
    const total = subtotal + order.deliveryCharge;
    doc.fontSize(12).font("Helvetica-Bold");
    doc.text("Total:", 350, tableY);
    doc.text(`Rs ${total.toFixed(2)}`, 450, tableY);

    doc.end();
    doc.pipe(res);
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

module.exports = {
  loadCheckOutPage,
  orderPlaced,
  orderConfirmation,
  paymentSuccessfull,
  loadMyOrdersPage,
  orderDetails,
  payFromOrderDetails,
  rateProduct,
  loadAddAddress,
  addAddress,
  loadEditAddress,
  editAddress,
  cancelOrder,
  returnOrder,
  applyCoupon,
  removeCoupon,
  downloadInvoice,
};
