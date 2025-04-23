const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Brand = require("../../models/brandSchema");
const Cart = require("../../models/cartSchema");
const Wishlist = require("../../models/wishlistSchema");
const env = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const {StatusCodes,ReasonPhrases} = require('http-status-codes');

const loadHomepage = async (req, res) => {
  try {
    const userId = req.session.user;
    let search = req.body.query || "";
    const userData = await User.findById(userId);
    const categories = await Category.find({ isListed: true });
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    const brands = await Brand.find({ isBlocked: false });
    if (cart && cart.items) {
      cart.items = cart.items.filter((item) => item.productId);
    }
    let productData = await Product.find({
      isBlocked: false,
      category: { $in: categories.map((category) => category._id) },
      featured: true,
    })
      .populate("category")
      .populate("productOffer")
      .populate({
        path: "category",
        populate: {
          path: "categoryOffer",
          model: "Offer",
        },
      })
      .sort({ createdOn: -1 })
      .limit(4);
    productData = productData.map((product) => {
      const status = product.quantity > 0 ? "Available" : "Out of Stock";
      return { ...product.toObject(), status };
    });

    if (userId) {
      res.render("home", {
        user: userData,
        products: productData,
        cart,
        wishlist,
        category: categories,
        brands,
        appliedFilters:{query:search}
      });
    } else {
      res.render("home", { user: null ,products:productData,cart:null,wishlist:null,category:categories,brands,appliedFilters:{query:search}});
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Server Error");
  }
};

const loadLogin = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.render("login");
    } else {
      return res.redirect(StatusCodes.MOVED_TEMPORARILY,"/");
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Server Internal Error");
  }
};

const loadSignup = async (req, res) => {
  try {
    return res.render("signup");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Server Error");
  }
};

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: "Verify your account",
      text: `Your OTP is ${otp}`,
      html: `<b>Your OTP : ${otp}</b>`,
    });

    return info.accepted.length > 0;
  } catch (error) {
    return false;
  }
}

const signup = async (req, res) => {
  try {
    const { name, phone, email, password, cPassword, referralCode } = req.body;
    if (password !== cPassword) {
      return res.render("signup", { message: "Password do not match" });
    }

    const findUser = await User.findOne({ email });

    if (findUser) {
      return res.render("signup", {
        message: "User with this email already exist",
      });
    }

    const otp = generateOtp();

    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res.json("email-error");
    }

    req.session.userOtp = otp;
    req.session.userData = {
      name,
      phone,
      email,
      password,
      googleId: null,
      referralCode,
    };

    res.render("verify-otp");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Server Internal Error");
  }
};

const securePassword = async (password) => {
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    return passwordHash;
  } catch (error) {
    throw new Error("Password hashing failed");
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    console.log(otp);

    if (otp === req.session.userOtp) {
      const user = req.session.userData;
      const userReferralCode = crypto
        .randomBytes(3)
        .toString("hex")
        .toUpperCase();
      const referralCode = user.referralCode;
      const passwordHash = await securePassword(user.password);
      const UserData = new User({
        name: user.name,
        email: user.email,
        phone: user.phone,
        password: passwordHash,
        referralCode: userReferralCode,
        referredBy: referralCode || null,
      });

      if (referralCode) {
        const referrer = await User.findOne({ referralCode });
        if (referrer) {
          referrer.wallet.balance += 100;
          UserData.wallet.balance += 100;
          const newTransaction = {
            transactionsType: "credit",
            amount: 100,
            reason: "Referred a friend",
            date: new Date(),
          };
          const anotherTransaction = {
            transactionsType: "credit",
            amount: 100,
            reason: "Referred by a friend",
            date: new Date(),
          };
          referrer.wallet.transactions.push(newTransaction);
          UserData.wallet.transactions.push(anotherTransaction);
          await referrer.save();
        }
      }

      await UserData.save();

      res.json({ success: true, redirectUrl: "/login" });
    } else {
      res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: "Invalid OTP, Please try again" });
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: "An error occured" });
  }
};

const resendOtp = async (req, res) => {
  try {
    const { email } = req.session.userData;
    if (!email) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: "Email not found in session" });
    }
    const otp = generateOtp();
    req.session.userOtp = otp;

    const emailSent = await sendVerificationEmail(email, otp);
    if (emailSent) {
      console.log("Resend OTP : ", otp);
      res
        .status(StatusCodes.OK)
        .json({ success: true, message: "OTP Resend Successfully" });
    } else {
      res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Failed to resend OTP. Please try again",
      });
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal Server Error. Please try again",
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const findUser = await User.findOne({ isAdmin: 0, email: email });

    if (!findUser) {
      return res.render("login", { message: "User not found" });
    }

    if (findUser.isBlocked) {
      return res.render("login", {
        message: "Access Denied. Please Contact Admin",
      });
    }

    const passwordMatch = await bcrypt.compare(password, findUser.password);
    if (!passwordMatch) {
      return res.render("login", { message: "Incorrect Password" });
    }

    req.session.user = findUser._id;

    res.redirect(StatusCodes.MOVED_TEMPORARILY,"/");
  } catch (error) {
    return res.render("login", {
      message: "Login failed. Please try again later",
    });
  }
};

const logout = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
      }

      return res.redirect("/login");
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

const loadForgotPassword = async (req, res) => {
  try {
    res.render("forgotPassword");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal server error");
  }
};

const forgotEmailValid = async (req, res) => {
  try {
    const { email } = req.body;
    const findUser = await User.findOne({ email: email, isAdmin: false });
    if (findUser) {
      const otp = generateOtp();

      const emailSent = await sendVerificationEmail(email, otp);
      if (emailSent) {
        req.session.otp = otp;
        req.session.email = email;

        res.render("forgotPasswordOtp");
      } else {
        res.json({
          success: false,
          message: "Failed to send OTP. Please try again",
        });
      }
    } else {
      res.render("forgotPassword", {
        message: "User with this email does not exist",
      });
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

const verifyForgotOtp = async (req, res) => {
  try {
    const enteredOtp = req.body.otp;
    if (enteredOtp === req.session.otp) {
      res.json({ success: true, redirectUrl: "/resetPassword" });
    } else {
      res.json({ success: false, message: "Otp not matching" });
    }
  } catch (error) {
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: "An error occured. Please try again" });
  }
};

const loadResetPassword = async (req, res) => {
  try {
    res.render("resetPassword");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal server error");
  }
};

const resendForgotOtp = async (req, res) => {
  try {
    const otp = generateOtp();
    console.log(otp);
    req.session.userOtp = otp;
    const email = req.session.email;

    const emailSent = await sendVerificationEmail(email, otp);
    if (emailSent) {
      res.status(StatusCodes.OK).json({ success: true, message: "Resend OTP successful" });
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: "Internal Server Error" });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { newPass1, newPass2 } = req.body;
    const email = req.session.email;
    if (newPass1 === newPass2) {
      const passwordHash = await securePassword(newPass1);
      await User.updateOne(
        { email: email },
        { $set: { password: passwordHash } }
      );
      res.redirect(StatusCodes.MOVED_TEMPORARILY,"/login");
    } else {
      res.render("resetPassword", { message: "Passwords do not match" });
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

const loadAboutPage = async(req,res) => {
  try {
    const userId = req.session.user;
    let search = req.body.query || "";
    const userData = await User.findById(userId);
    const categories = await Category.find({ isListed: true });
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    res.render('aboutUs',{user:userData,category:categories,cart,wishlist,appliedFilters:{query:search}});
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Internal server error');
  }
}

const loadContactPage = async(req,res) => {
  try {
    const userId = req.session.user;
    let search = req.body.query || "";
    const userData = await User.findById(userId);
    const categories = await Category.find({ isListed: true });
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    res.render('contactUs',{user:userData,category:categories,cart,wishlist,appliedFilters:{query:search}});
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Internal server error');
  }
}
module.exports = {
  loadHomepage,
  loadLogin,
  loadSignup,
  signup,
  verifyOtp,
  resendOtp,
  login,
  logout,
  loadForgotPassword,
  forgotEmailValid,
  verifyForgotOtp,
  loadResetPassword,
  resendForgotOtp,
  resetPassword,
  loadAboutPage,
  loadContactPage
};
