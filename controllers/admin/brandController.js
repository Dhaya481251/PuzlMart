const Brand = require("../../models/brandSchema");
const Product = require("../../models/productSchema");
const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const Notification = require("../../models/notificationSchema");
const {StatusCodes,ReasonPhrases} = require('http-status-codes');

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

const fetchBrandData = async() => {
  const limit = 4;
  const brandData = await Brand.find()
  .sort({createdAt:-1});

  const totalBrands = await Brand.countDocuments();
  const totalPages = Math.ceil(totalBrands/limit);
  const reverseBrand = brandData.reverse();
  const notifications = await Notification.find({
    notificationType:"returnRequest"
  })
  .populate("orderId")
  .sort({createdOn:-1});
  
  return {reverseBrand,totalPages,totalBrands,notifications};
  
}

const getBrandPage = async (req, res) => {
  const {users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands} = await fetchDashboardData();
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;
    const brandData = await Brand.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const totalBrands = await Brand.countDocuments();
    const totalPages = Math.ceil(totalBrands / limit);
    const reverseBrand = brandData.reverse();
    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });
    res.render("brands", {
      data: reverseBrand,
      currentPage: page,
      totalPages: totalPages,
      totalBrands: totalBrands,
      notifications,
      errorMessage:null
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('admin-dashboard',{errorMessage:'Something went wrong! Please try again.',users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands});
  }
};

const addBrand = async (req, res) => {
  const {reverseBrand,totalPages,totalBrands,notifications} = await fetchBrandData();
  const page = parseInt(req.query.page) || 1;
  try {
    const { name } = req.body;
    const findBrand = await Brand.findOne({ brandName: name });
    if (findBrand) {
      return res
        .status(400)
        .json({ message: "Brand already exists", type: "error" });
    }
    if (!findBrand) {
      const image = req.file.filename;
      const newBrand = new Brand({
        brandName: name,
        brandImage: image,
      });
      await newBrand.save();
      return res
        .status(200)
        .json({ message: "Brand added successfully", type: "success" });
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({message:'Something went wrong! Please try again.', type:'error'});
  }
};

const blockBrand = async (req, res) => {
  const {reverseBrand,totalPages,totalBrands,notifications} = await fetchBrandData();
  const page = parseInt(req.query.page) || 1;
  try {
    const brandd = req.query.id;
    await Brand.updateOne({ _id: brandId }, { $set: { isBlocked: true } });
    res.status(StatusCodes.OK).redirect('/admin/brands')
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('brands',{errorMessage:'Something went wrong! Please try again.',data:reverseBrand,currentPage:page,totalPages,totalBrands,notifications});
  }
};

const unblockBrand = async (req, res) => {
  const {reverseBrand,totalPages,totalBrands,notifications} = await fetchBrandData();
  const page = parseInt(req.query.page) || 1;
  try {
    const brandId = req.query.id;
    await Brand.updateOne({ _id: brandId }, { $set: { isBlocked: false } });
    res.status(StatusCodes.OK).redirect('/admin/brands')
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('brands',{errorMessage:'Something went wrong! Please try again.',data:reverseBrand,currentPage:page,totalPages,totalBrands,notifications});
  }
};

const deleteBrand = async (req, res) => {
  const {reverseBrand,totalPages,totalBrands,notifications} = await fetchBrandData();
  const page = parseInt(req.query.page) || 1;
  try {
    const brandId = req.query.id;
    if (!brandId) {
      return res.status(StatusCodes.NOT_FOUND).send(`Brand id ${ReasonPhrases.NOT_FOUND}`)
    }
    const result = await Brand.deleteOne({ _id: brandId });
    if (result.deletedCount === 0) {
    return res.status(StatusCodes.NOT_FOUND).send(`Brand is ${ReasonPhrases.NOT_FOUND}`)
    }
    res.status(StatusCodes.OK).send('Brand deleted successfully')
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('brands',{errorMessage:'Something went wrong! Please try again.',data:reverseBrand,currentPage:page,totalPages,totalBrands,notifications});
  }
};

module.exports = {
  getBrandPage,
  addBrand,
  blockBrand,
  unblockBrand,
  deleteBrand,
};
