const express = require("express");
const router = express.Router();

//Controllers
const adminController = require("../controllers/admin/adminController");
const customerController = require("../controllers/admin/customerController");
const categoryController = require("../controllers/admin/categoryController");
const brandController = require("../controllers/admin/brandController");
const productController = require("../controllers/admin/productController");
const orderController = require("../controllers/admin/orderController");
const couponController = require("../controllers/admin/couponController");
const offerController = require("../controllers/admin/offerController");

const { userAuth, adminAuth,validateCartState } = require("../middlewares/auth");

const multer = require("multer");
const storage = require("../helpers/multer");
const uploads = multer({ storage: storage });

//admin login
router.get("/login", adminController.loadLogin);
router.post("/login", adminController.login);
router.get("/", adminAuth, adminController.loadDashboard);
router.post("/search", adminAuth, adminController.searchAll);
router.get("/logout", adminController.logout);
//user management
router.get("/users", adminAuth, customerController.customerInfo);
router.post(
  "/blockCustomer/:id",
  adminAuth,
  customerController.customerBlocked
);
router.post(
  "/unblockCustomer/:id",
  adminAuth,
  customerController.customerunBlocked
);
//category management
router.get("/category", adminAuth, categoryController.categoryInfo);
router.get("/addCategory", adminAuth, categoryController.loadAddCategory);
router.post(
  "/addCategory",
  adminAuth,
  uploads.single("CategoryImage"),
  categoryController.addCategory
);
router.get(
  "/addCategoryOffer",
  adminAuth,
  categoryController.loadAddCategoryOffer
);
router.post(
  "/addCategoryOffer/:id",
  adminAuth,
  categoryController.addCategoryOffer
);
router.post(
  "/removeCategoryOffer",
  adminAuth,
  categoryController.removeCategoryOffer
);
router.get("/listCategory", adminAuth, categoryController.getListCategory);
router.get("/unlistCategory", adminAuth, categoryController.getUnlistCategory);
router.get("/editCategory", adminAuth, categoryController.getEditCategory);
router.post(
  "/editCategory/:id",
  adminAuth,
  uploads.single("CategoryImage"),
  categoryController.editCategory
);
router.delete(
  "/removeCategory/:id",
  adminAuth,
  categoryController.removeCategory
);
//brand management
router.get("/brands", adminAuth, brandController.getBrandPage);
router.post(
  "/addBrand",
  adminAuth,
  uploads.single("image"),
  brandController.addBrand
);
router.get("/blockBrand", adminAuth, brandController.blockBrand);
router.get("/unblockBrand", adminAuth, brandController.unblockBrand);
router.delete("/deleteBrand", adminAuth, brandController.deleteBrand);
//product management
router.get("/products", adminAuth, productController.getProducts);
router.get("/addProducts", adminAuth, productController.getProductAddPage);
router.post(
  "/addProducts",
  uploads.array("images", 4),
  productController.addProducts
);
router.get(
  "/addProductOffer",
  adminAuth,
  productController.loadAddProductOffer
);
router.post(
  "/addProductOffer/:id",
  adminAuth,
  productController.addProductOffer
);
router.post(
  "/removeProductOffer",
  adminAuth,
  productController.removeProductOffer
);
router.get("/blockProduct", adminAuth, productController.blockProduct);
router.get("/unblockProduct", adminAuth, productController.unblockProduct);
router.get("/editProduct", adminAuth, productController.getEditProduct);
router.post(
  "/editProduct/:id",
  adminAuth,
  uploads.array("images", 4),
  productController.editProduct
);
router.post("/deleteImage", adminAuth, productController.deleteImage);
router.delete("/removeProduct", adminAuth, productController.removeProduct);
router.get("/featured", adminAuth, productController.featuredProduct);
router.get("/unFeatured", adminAuth, productController.unFeaturedProduct);

//Order management
router.get("/orders", adminAuth, orderController.listOrders);
router.post("/orders/:orderId/:itemId/status", adminAuth, orderController.changeOrderStatus);
router.post("/orders/:orderId/:itemId/cancel", adminAuth, orderController.cancelOrder);
router.get("/moreDetails/:id", adminAuth, orderController.moreDetails);
router.post("/handleReturnRequest/:orderId/:itemId",adminAuth,orderController.handleReturnRequest);

//coupon management
router.get("/coupons", adminAuth, couponController.getCoupons);
router.get("/addCoupon", adminAuth, couponController.loadAddCouponPage);
router.post("/addCoupon", adminAuth, couponController.addCoupon);
router.delete("/removeCoupon/:id", adminAuth, couponController.removeCoupon);
router.get("/activeCoupon", adminAuth, couponController.activeCoupon);
router.get("/inactiveCoupon", adminAuth, couponController.inactiveCoupon);

//sales management
router.get("/salesReport", adminAuth, adminController.salesReport);
router.post("/filterSalesReport", adminAuth, adminController.filterSalesReport);
router.get("/downloadPDF", adminAuth, adminController.downloadPDF);
router.get("/downloadEXCEL", adminAuth, adminController.downloadEXCEL);
router.get("/getChartData", adminAuth, adminController.getChartData);
//Offer management
router.get("/offer", adminAuth, offerController.loadOffer);
router.get("/activateOffer", adminAuth, offerController.activateOffer);
router.get("/deactivateOffer", adminAuth, offerController.deactivateOffer);

module.exports = router;
