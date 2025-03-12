const express = require("express");
const router = express.Router();
const passport = require("passport");
//const paypal = require('paypal');

//controllers
const userController = require("../controllers/user/userController");
const productController = require("../controllers/user/productController");
const profileController = require("../controllers/user/profileController");
const cartController = require("../controllers/user/cartController");
const orderController = require("../controllers/user/orderController");
const wishlistController = require("../controllers/user/wishlistController");
const walletController = require("../controllers/user/walletController");

const { userAuth, adminAuth } = require("../middlewares/auth");

const multer = require("multer");
const storage = require("../helpers/multer");
const uploads = multer({ storage: storage });

//User login
router.get("/login", userController.loadLogin);
router.get("/signup", userController.loadSignup);
router.post("/signup", userController.signup);
router.post("/verify-otp", userController.verifyOtp);
router.post("/resend-otp", userController.resendOtp);
router.post("/login", userController.login);
router.get("/", userAuth, userController.loadHomepage);
router.get("/logout", userController.logout);
router.get("/forgotPassword", userController.loadForgotPassword);
router.post("/forgotEmailValid", userController.forgotEmailValid);
router.post("/verifyForgotOtp", userController.verifyForgotOtp);
router.get("/resetPassword", userController.loadResetPassword);
router.post("/resendForgotOtp", userController.resendForgotOtp);
router.post("/resetPassword", userController.resetPassword);
router.get('/about',userAuth,userController.loadAboutPage);
router.get('/contact',userAuth,userController.loadContactPage);

//Google Auth login
router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);
router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    if (req.user) {
      req.session.user = req.user._id;
      res.redirect("/");
    } else {
      return res.redirect("/login");
    }
  }
);

//Product management
router.get("/products", userAuth, productController.loadProductpage);
router.get(
  "/productDetails/:id",
  userAuth,
  productController.loadProductDetailspage
);
router.get(
  "/filterProductByCategory",
  userAuth,
  productController.filterProductByCategory
);
router.post("/search", userAuth, productController.searchProducts);
router.post(
  "/rateProduct/:productId",
  userAuth,
  productController.leaveAReview
);
//User profile management
router.get("/userProfile", userAuth, profileController.loadUserProfilePage);
router.get("/userDetails", userAuth, profileController.loadUserDetailsPage);
router.post("/editName", userAuth, profileController.editName);
router.post("/editEmail", userAuth, profileController.editEmail);
router.post("/verifyOtp", userAuth, profileController.emailVerifyOtp);
router.post("/resendOtp", userAuth, profileController.emailResendOtp);
router.get("/userAddress", userAuth, profileController.loadUserAddressPage);
router.get("/addAddress", userAuth, profileController.loadAddAddress);
router.post("/addAddress", userAuth, profileController.addAddress);
router.get("/editAddress", userAuth, profileController.loadEditAddress);
router.post("/editAddress", userAuth, profileController.editAddress);
router.get("/deleteAddress", userAuth, profileController.deleteAddress);
router.get("/referral", userAuth, profileController.loadReferralPage);

//Cart management
router.get("/cart", userAuth, cartController.loadCart);
router.get("/addToCart/:id", userAuth, cartController.addToCart);
router.get("/removeFromCart/:id", userAuth, cartController.removeFromCart);
router.post("/increaseQuantity/:id", userAuth, cartController.increaseQuantity);
router.post("/decreaseQuantity/:id", userAuth, cartController.decreaseQuantity);

//Order management
router.get("/buyNow", userAuth, orderController.loadCheckOutPage);
router.post("/buy", userAuth, orderController.orderPlaced);
router.get("/orderConfirmation", userAuth, orderController.orderConfirmation);
router.get("/paymentSuccessfull", userAuth, orderController.paymentSuccessfull);
router.get("/myOrders", userAuth, orderController.loadMyOrdersPage);
router.get("/orderDetails/:id", userAuth, orderController.orderDetails);
router.post(
  "/startPayPalPayment/:id",
  userAuth,
  orderController.payFromOrderDetails
);
router.post(
  "/rateProduct/:orderId/:productId",
  userAuth,
  orderController.rateProduct
);
router.get("/orderAddAddress", userAuth, orderController.loadAddAddress);
router.post("/orderAddAddress", userAuth, orderController.addAddress);
router.get("/orderEditAddress", userAuth, orderController.loadEditAddress);
router.post("/orderEditAddress", userAuth, orderController.editAddress);
router.post("/cancelOrder/:id", userAuth, orderController.cancelOrder);
router.post("/returnOrder/:id", userAuth, orderController.returnOrder);
router.post("/applyCoupon", userAuth, orderController.applyCoupon);
router.post("/removeCoupon", userAuth, orderController.removeCoupon);
router.get("/order/invoice/:id", userAuth, orderController.downloadInvoice);

//Wishlist management
router.get("/wishlist", userAuth, wishlistController.loadWishlist);
router.get("/addToWishlist/:id", userAuth, wishlistController.addToWishlist);
router.get("/removeFromWishlist/:id",userAuth,wishlistController.removeFromWishlist);
//wallet management
router.get("/wallet", userAuth, walletController.loadWallet);

module.exports = router;
