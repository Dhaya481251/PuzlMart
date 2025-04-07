const User = require("../../models/userSchema");
const Offer = require("../../models/offerSchema");
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

const fetchOfferData = async() => {
  const limit = 4;
  const offers = await Offer.find()
  .sort({createdOn:-1});

  const totalOffers = await Offer.countDocuments();
  const totalPages = Math.ceil(totalOffers/limit);

  const notifications = await Notification.find({
    notificationType:'returnRequest'
  })
  .populate('orderId')
  .sort({createdOn:-1});

  return {offers,totalOffers,totalPages,notifications}
};

const loadOffer = async (req, res) => {
  const {users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands} = await fetchDashboardData();
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;

    const offers = await Offer.find({})
      .sort({ createdOn: -1 })
      .skip(skip)
      .limit(limit);

    const totalOffers = await Offer.countDocuments();
    const totalPages = Math.ceil(totalOffers / limit);

    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });

    res.render("offer", {
      offers,
      currentPage: page,
      totalPages: totalPages,
      totalOffers: totalOffers,
      notifications,
      errorMessage:null
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('admin-dashboard',{errorMessage:'Something went wrong! Please try again',users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands});
  }
};

const activateOffer = async (req, res) => {
  const {offers,totalOffers,totalPages,notifications} = await fetchOfferData();
  const page = parseInt(req.query.page) || 1;
  try {
    let offerId = req.query.id;
    await Offer.updateOne({ _id: offerId }, { $set: { isActive: false } });
    res.redirect("/admin/offer");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('offer',{errorMessage:'Something went wrong! Please try again.',offers,currentPage:page,totalPages,totalOffers,notifications});
  }
};

const deactivateOffer = async (req, res) => {
  const {offers,totalOffers,totalPages,notifications} = await fetchOfferData();
  const page = parseInt(req.query.page) || 1;
  try {
    let offerId = req.query.id;
    await Offer.updateOne({ _id: offerId }, { $set: { isActive: true } });
    res.redirect("/admin/offer");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('offer',{errorMessage:'Something went wrong! Please try again.',offers,currentPage:page,totalPages,totalOffers,notifications});
  }
};

module.exports = {
  loadOffer,
  activateOffer,
  deactivateOffer,
};
