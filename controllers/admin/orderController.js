const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Notification = require("../../models/notificationSchema");
const mongoose = require("mongoose");
const Product = require("../../models/productSchema");

const {StatusCodes,ResponsePhrases} = require('http-status-codes');

const fetchDashboardData = async() => {
  const users = await User.find({isAdmin:false});
  const orders = await Order.find()
  .sort({createdOn:-1})
  .populate('items.productId')
  .populate('userId');
  const products = await Product.find();
  const notifications = await Notification.find({notificationType:'returnRequest'})
  .populate('orderId')
  .sort({createdOn:-1});

  const topSellingProducts = await Order.aggregate([
    {$unwind:'$items'},
    {$group:{_id:'$items.productId',totalQuantitySold:{$sum:'$items.quantity'}}},
    {$sort:{totalQuantitySold:-1}},
    {$limit:10},
    {$lookup:{from:'products',localField:'_id',foreignField:'_id',as:'productDetails'}},
    {$unwind:'$productDetails'}
  ]);
  const topSellingCategories = await Order.aggregate([
    {$unwind:'$items'},
    {$lookup:{from:'products',localField:'items.productId',foreignField:'_id',as:'productDetails'}},
    {$unwind:'$productDetails'},
    {$group:{_id:'$productDetails.category',totalQuantitySold:{$sum:'$items.quantity'}}},
    {$sort:{totalQuantitySold:-1}},
    {$limit:10},
    {$lookup:{from:'categories',localField:'_id',foreignField:'_id',as:'categoryDetails'}},
    {$unwind:'$categoryDetails'},
    {$project:{_id:'$categoryDetails',totalQuantitySold:1}}
  ])

  const topSellingBrands = await Order.aggregate([
    {$unwind:'$items'},
    {$lookup:{from:'products',localField:'items.productId',foreignField:'_id',as:'productDetails'}},
    {$unwind:'$productDetails'},
    {$group:{_id:'$productDetails.brand',totalQuantitySold:{$sum:'$items.quantity'}}},
    {$sort:{totalQuantitySold:-1}},
    {$limit:10},
    {$lookup:{from:'brands',localField:'_id',foreignField:'brandName',as:'brandDetails'}},
    {$unwind:'$brandDetails'},
    {$project:{brandName:'$_id',brandImage:'$brandDetails.brandImage',totalQuantitySold:1}}
  ])
  return {users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands};
};

const fetchOrderData = async() => {
  const limit = 10;
  const orders = await Order.find()
  .populate('items.productId')
  .sort({createdOn:-1});

  const totalOrders = await Order.countDocuments();
  const totalPages = Math.ceil(totalOrders/limit);

  const notifications = await Notification.find({
    notificationType:'returnRequest'
  })
  .populate('orderId')
  .sort({createdOn:-1});

  return {orders,totalPages,totalOrders,notifications};
};

const listOrders = async (req, res) => {
  const {users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands} = await fetchDashboardData();
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const orders = await Order.find()
      .populate("items.productId")
      .sort({ createdOn: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    const totalOrders = await Order.countDocuments();
    const totalPages = Math.ceil(totalOrders / limit);

    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });

    res.render("orders", {
      orders,
      currentPage: page,
      totalPages: totalPages,
      totalOrders: totalOrders,
      notifications,
      errorMessage:null
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('admin-dashboard',{errorMessage:'Something went wrong! Please try again.',users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands});
  }
};

const changeOrderStatus = async (req, res) => {
  const {orders,totalPages,totalOrders,notifications} = await fetchOrderData();
  const page = parseInt(req.query.page) || 1;
  try {
    const orderId = req.params.orderId;
    const itemId = req.params.itemId;
    const { status } = req.body;
    if (
      !status ||
      ![
        "Pending",
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled",
        "Return Request",
        "Returned",
      ].includes(status)
    ) {
      return res.status(StatusCodes.BAD_REQUEST).render('orders',{errorMessage:"Invalid order status",orders,totalPages,currentPage:page,totalOrders,notifications});
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).render('orders',{errorMessage:"Order not found",orders,totalPages,currentPage:page,totalOrders,notifications});
    }
    const item = order.items.find(item => item.productId.toString() === itemId);
    if (!item) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: "Item not found in order"});
    }
    item.status = status;
    if (item.status === "Delivered") {
      order.deliveryDate = new Date(Date.now());
      order.paymentStatus = "Paid";
      await order.save();
    }
    await order.save();

    res.redirect("/admin/orders");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('orders',{errorMessage:'Something went wrong! Please try again.',orders,totalPages,currentPage:page,totalOrders,notifications});
  }
};

const cancelOrder = async (req, res) => {
  const {orders,totalPages,totalOrders,notifications} = await fetchOrderData();
  const page = parseInt(req.query.page) || 1;
  try {
    const orderId = req.params.orderId;
    const itemId = req.params.itemId;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).render('orders',{errorMessage:"Order not found",orders,totalPages,currentPage:page,totalOrders,notifications});
    }
    const item = order.items.find(item => item.productId.toString() === itemId);
    if (!item) {
          return res.status(StatusCodes.NOT_FOUND).json({ message: "Item not found in order"});
    }
        
    if (item.status !== "Pending") {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .render('orders',{errorMessage:"Order cannot be cancelled in its current status",orders,totalPages,currentPage:page,totalOrders,notifications});
    }

    item.status = "Cancelled";
    await order.save();

    res.redirect("/admin/orders");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('orders',{errorMessage:'Something went wrong! Please try again.',orders,totalPages,currentPage:page,totalOrders,notifications});
  }
};
const moreDetails = async (req, res) => {
  const {orders,totalPages,totalOrders,notifications} = await fetchOrderData();
  const page = parseInt(req.query.page) || 1;
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId).populate("items.productId");
    const notifications = await Notification.find()
      .populate("orderId")
      .sort({ createdOn: -1 });
    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).render('orders',{errorMessage:"Order not found",orders,totalPages,currentPage:page,totalOrders,notifications});
    }

    res.render("orderMoreDetails", {
      orders: order,
      notifications: notifications,
      errorMessage:null
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('orders',{errorMessage:'Something went wrong! Please try again.',orders,totalPages,currentPage:page,totalOrders,notifications});
  }
};

const handleReturnRequest = async (req, res) => {
  const {orders,totalPages,totalOrders,notifications} = await fetchOrderData();
  const page = parseInt(req.query.page) || 1;
  try {
    const orderId = req.params.orderId;
    const itemId = req.params.itemId;
    const { action } = req.body;

    if (action !== "approve" && action !== "decline") {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: "Invalid action provided" });
    }

    const order = await Order.findById({ _id: orderId });
    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: "Order not found" });
    }

    const item = order.items.find(item => item.productId.toString() === itemId);
    if (!item) {
          return res.status(StatusCodes.NOT_FOUND).json({ message: "Item not found in order"});
    }

    if (action === "approve") {
      item.returnStatus = "Accepted";
      item.returnProcedureStartDate = new Date();
      item.status = "Returned";
      await order.save();

      const notification = new Notification({
        userId: order.userId,
        orderId: order._id,
        NotificationMessage:"Return request accepted. The product will be collected within 2 days, and the amount will be credited to your wallet today.",
        notificationType: "returnApproval",
      });
      await notification.save();

      if (order.paymentStatus === "Paid") {
        const user = await User.findById(order.userId);
        user.wallet.balance =
          (user.wallet.balance || 0) + (order.finalAmount || 0);

        const newTransaction = {
          transactionsType: "credit",
          amount: order.finalAmount,
          reason: "Order Return Refund",
          date: new Date(),
        };
        user.wallet.transactions.push(newTransaction);

        await user.save();
      }

      res.status(StatusCodes.OK).json({
        message: "Return request approved and refund processed",
        type: "success",
      });
    } else if (action === "decline") {
      item.returnStatus = "Declined";
      await order.save();

      const notification = new Notification({
        userId: order.userId,
        orderId: order._id,
        NotificationMessage:
          "Return request declined. This product cannot be returned for a reason.",
        notificationType: "returnDecline",
      });
      await notification.save();

      res
        .status(StatusCodes.OK)
        .json({ message: "Return request declined", type: "success" });
    }
  } catch (error) {
    console.log('Error while accepting/declining return request : ',error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({message:'Something went wrong! Please try again.'});
  }
};

module.exports = {
  listOrders,
  changeOrderStatus,
  cancelOrder,
  moreDetails,
  handleReturnRequest,
};
