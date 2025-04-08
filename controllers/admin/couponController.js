const Coupon = require("../../models/couponSchema");
const Notification = require("../../models/notificationSchema");
const User = require("../../models/userSchema");
const Order = require("../../models/orderSchema");
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

const fetchCouponData = async() => {
  const limit = 4;
  const coupons = await Coupon.find()
  .sort({createdOn:-1});

  const totalCoupons = await Coupon.countDocuments();
  const totalPages = Math.ceil(totalCoupons/limit);

  const notifications = await Notification.find({
    notificationType:'returnRequest'
  })
  .populate('orderId')
  .sort({createdOn:-1});

  return {coupons,totalPages,totalCoupons,notifications};
}

const getCoupons = async (req, res) => {
  const {users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands} = await fetchDashboardData();
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;
    
    const coupons = await Coupon.find({})
      .sort({ createdOn: -1 })
      .skip(skip)
      .limit(limit);

    const totalCoupons = await Coupon.countDocuments();
    const totalPages = Math.ceil(totalCoupons / limit);

    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });

    res.render("coupons", {
      coupons,
      currentPage: page,
      totalPages: totalPages,
      totalCoupons: totalCoupons,
      notifications,
      errorMessage:null
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('admin-dashboard',{errorMessage:'Something went wrong! Please try again.',users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands});
  }
};

const loadAddCouponPage = async (req, res) => {
  const {coupons,totalPages,totalCoupons,notifications} = await fetchCouponData();
  const page = parseInt(req.query.page) || 1;
  try {
    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });

    res.render("addCoupon", { notifications ,errorMessage:null});
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('coupons',{errorMessage:'Something went wrong! Please try again.',coupons,currentPage:page,totalPages,totalCoupons,notifications});
  }
};

const addCoupon = async (req, res) => {
  try {
    const {
      name,
      code,
      expireOn,
      minimumPrice,
      discountType,
      discount,
      usageLimit,
    } = req.body;

    const existingCoupon = await Coupon.findOne({
      $or: [{ name: name }, { code: code }],
    });
    let products = await Product.find();
    if (existingCoupon) {
      res.status(StatusCodes.BAD_REQUEST).json({ message: "Coupon already exists", type: "error" });
    } else {
      if (discountType === "Percentage") {
        if (discount < 1 || discount > 90) {
          return res
            .status(StatusCodes.BAD_REQUEST)
            .json({ message: "Discount value must be between 1 and 90" });
        } else {
          const newCoupon = new Coupon({
            name,
            code,
            expireOn,
            minimumPrice,
            discountType,
            discount,
            usageLimit,
            usedCount: 0,
          });
          await newCoupon.save();
          return res
            .status(StatusCodes.OK)
            .json({ message: "Coupon added successfully", type: "success" });
        }
      } else if (discountType === "Flat") {
        const minProductPrice = Math.min(...products.map((product) => product.regularPrice));
        if(minimumPrice >= minProductPrice){
              return res.status(StatusCodes.BAD_REQUEST).json({type:'error',message:`Minimum price of the coupon must be less than the least product price ${minProductPrice}`});
        }else if(discount >= minProductPrice){
              return res.status(StatusCodes.BAD_REQUEST).json({type:'error',message:`Discount of the coupon must be less than the least product price ${minProductPrice}`})
        }else{const newCoupon = new Coupon({
          name,
          code,
          expireOn,
          minimumPrice,
          discountType,
          discount,
          usageLimit,
          usedCount: 0,
        });
        await newCoupon.save();
        return res
          .status(StatusCodes.OK)
          .json({ message: "Coupon added successfully", type: "success" });
      }}
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong! Please try again.', type: "error" });
  }
};

const removeCoupon = async (req, res) => {
  try {
    const couponId = req.params.id;
    const removeCoupon = await Coupon.findByIdAndDelete(couponId);

    if (!removeCoupon) {
      res.status(StatusCodes.NOT_FOUND).json({ status: false, message: "Coupon not found" });
    }

    return res
      .status(StatusCodes.OK)
      .json({ status:true, message: "Category deleted successfully", removeCoupon });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ status: false, message: 'Something went wrong! Please try again.' });
  }
};

const activeCoupon = async (req, res) => {
  const {coupons,totalPages,totalCoupons,notifications} = await fetchCouponData();
  const page = parseInt(req.query.page) || 1;
  try {
    let couponId = req.query.id;
    await Coupon.updateOne({ _id: couponId }, { $set: { isActive: true } });
    res.redirect("/admin/coupons");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('coupons',{errorMessage:'Something went wrong! Please try again.',coupons,currentPage:page,totalPages,totalCoupons,notifications});
  }
};

const inactiveCoupon = async (req, res) => {
  const {coupons,totalPages,totalCoupons,notifications} = await fetchCouponData();
  const page = parseInt(req.query.page) || 1;
  try {
    let couponId = req.query.id;
    await Coupon.updateOne({ _id: couponId }, { $set: { isActive: false } });
    res.redirect("/admin/coupons");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('coupons',{errorMessage:'Something went wrong! Please try again.',coupons,currentPage:page,totalPages,totalCoupons,notifications});
  }
};

module.exports = {
  getCoupons,
  loadAddCouponPage,
  addCoupon,
  removeCoupon,
  activeCoupon,
  inactiveCoupon,
};
