const User = require("../../models/userSchema");
const Notification = require("../../models/notificationSchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");

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

const fetchCustomerData = async() => {
  const limit = 3;
  const userData = await User.find({
    isAdmin:false,
  }).limit(limit);

  const count = await User.find({isAdmin:false}).countDocuments();
  const totalPages = Math.ceil(count/limit);
  const notifications = await Notification.find({notificationType:'returnRequest'})
  .populate('orderId')
  .sort({createdOn:-1});

  return {userData,totalPages,notifications}
}

const customerInfo = async (req, res) => {
  const {users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands} = await fetchDashboardData();
  try {
    let search = "";
    if (req.query.search) {
      search = req.query.search;
    }
    let page = 1;
    if (req.query.page) {
      page = req.query.page;
    }
    const limit = 3;
    const userData = await User.find({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*" } },
        { email: { $regex: ".*" + search + ".*" } },
      ],
    })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await User.find({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*" } },
        { email: { $regex: ".*" + search + ".*" } },
      ],
    }).countDocuments();

    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });

    res.render("customers", {
      data: userData,
      totalPages: Math.ceil(count/limit),
      currentPage: page,
      notifications,
      errorMessage:null
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('admin-dashboard',{errorMessage:'Something went wrong! Please try again.',users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands});
  }
};

const customerBlocked = async (req, res) => {
  const {userData,totalPages,notifications} = await fetchCustomerData();
  const page = req.query.page || 1;
  try {
    const userId = req.params.id;
    const user = await User.findByIdAndUpdate(userId, { isBlocked: true });

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: "User not found" });
    }

    if (req.session.user === userId) {
      req.session.destroy((err) => {
        if (err) {
          return res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('customers',{errorMessage:'Something went wrong! Please try again.',data:userData,currentPage:page,totalPages,notifications});
        }
        return res.redirect("/login");
      });
    } else {
      res.status(StatusCodes.OK).send("User blocked successfully");
    }
  } catch {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('customers',{errorMessage:'Something went wrong! Please try again.',data:userData,currentPage:page,totalPages,notifications});
  }
};

const customerunBlocked = async (req, res) => {
  const {userData,totalPages,notifications} = await fetchCustomerData();
  const page = req.query.page || 1;
  try {
    let userId = req.params.id;
    await User.findByIdAndUpdate(userId, { isBlocked: false });
    res.status(StatusCodes.OK).send("Unblock the user successfully");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('customers',{errorMessage:'Something went wrong! Please try again.',data:userData,currentPage:page,totalPages,notifications});
  }
};

module.exports = {
  customerInfo,
  customerBlocked,
  customerunBlocked,
};
