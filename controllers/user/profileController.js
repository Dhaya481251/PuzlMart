const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const Cart = require("../../models/cartSchema");
const Category = require("../../models/categorySchema");
const Wishlist = require("../../models/wishlistSchema");
const nodemailer = require("nodemailer");
const env = require("dotenv").config();
const bcrypt = require("bcrypt");
const session = require("express-session");
const Coupon = require("../../models/couponSchema");

const {StatusCodes,ReasonPhrases} = require('http-status-codes');

const loadUserProfilePage = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });
    res.render("userProfile", {
      user: userData,
      cart,
      wishlist,
      category: category,
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};
const loadUserDetailsPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });

    const userData = await User.findById(userId);

    res.render("userDetails", {
      user: userData,
      cart,
      wishlist,
      category: category,
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

const editName = async (req, res) => {
  try {
    const newName = req.body.newName;
    const userId = req.session.user;
    const user = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const category = await Category.find({ isListed: true });
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    user.name = newName;
    await user.save();

    res.redirect(StatusCodes.MOVED_TEMPORARILY, "/userDetails");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal server error");
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

const editEmail = async (req, res) => {
  try {
    const newEmail = req.body.newEmail;
    const userId = req.session.user;
    const findUser = await User.findById(userId);
    const otp = generateOtp();

    req.session.email = newEmail;
    const emailSent = await sendVerificationEmail(newEmail, otp);
    if (!emailSent) {
      return res.json("email-error");
    }
    req.session.userOtp = otp;
    res.render("verifyOtp");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

const emailVerifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (otp.trim() === req.session.userOtp.toString().trim()) {
      console.log(otp);
      const newEmail = req.session.email;
      const userId = req.session.user;
      console.log("New Email : ", newEmail);

      const user = await User.findById(userId);
      user.email = newEmail;
      await user.save();

      res.json({ success: true, redirectUrl: "/userDetails" });
    } else {
      res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: "Invalid OTP, Please ty again" });
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: "An error occured" });
  }
};

const emailResendOtp = async (req, res) => {
  try {
    const newEmail = req.session.email;
    if (!newEmail) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: "Email not found in session" });
    }

    const otp = generateOtp();

    req.session.userOtp = otp;
    const emailSent = await sendVerificationEmail(email, otp);
    if (emailSent) {
      res
        .status(StatusCodes.OK)
        .json({ success: true, message: "OTP Resend Successfully" });
    } else {
      res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Failed to resend OTP. Please try again.",
      });
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: "Internal Server Error." });
  }
};

const loadUserAddressPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });
    const addressData = await Address.findOne({ userId: userData._id });
    res.render("userAddressPage", {
      user: userData,
      userAddress: addressData,
      cart,
      wishlist,
      category: category,
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

const loadAddAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });
    res.render("addAddressPage", {
      user: userData,
      cart,
      wishlist,
      category: category,
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

const addAddress = async (req, res) => {
  try {
    const userId = req.session.user;
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
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });
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
        cart,
      });
      await userAddress.save();
    }
    res.redirect(StatusCodes.MOVED_TEMPORARILY, "/userAddress");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal server error");
  }
};

const loadEditAddress = async (req, res) => {
  try {
    const addressId = req.query.id;
    const user = req.session.user;
    const userData = await User.findById(user);
    const cart = await Cart.findOne({ user }).populate("items.productId");
    const currentAddress = await Address.findOne({ "address._id": addressId });
    const wishlist = await Wishlist.findOne({ user }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });
    if (!currentAddress) {
      return res.status(StatusCodes.NOT_FOUND).send("Address not found");
    }

    const addressData = currentAddress.address.find((item) => {
      return item._id.toString() === addressId.toString();
    });

    if (!addressData) {
      return res.status(StatusCodes.NOT_FOUND).send("Address not found");
    }

    res.render("editAddressPage", {
      address: addressData,
      user: userData,
      cart,
      wishlist,
      category: category,
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal server error");
  }
};

const editAddress = async (req, res) => {
  try {
    const data = req.body;
    const addressId = req.query.id;
    const user = req.session.user;
    const cart = await Cart.findOne({ user }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ user }).populate(
      "products.productsId"
    );
    const findAddress = await Address.findOne({ "address._id": addressId });
    const category = await Category.find({ isListed: true });

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

    res.redirect(StatusCodes.MOVED_TEMPORARILY, "/userAddress");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal server error");
  }
};

const deleteAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });
    const addressId = req.query.id;
    const findAddress = await Address.findOne({ "address._id": addressId });
    if (!findAddress) {
      return res.status(StatusCodes.NOT_FOUND).send("Address not found");
    }

    await Address.updateOne(
      { "address._id": addressId },
      {
        $pull: {
          address: { _id: addressId },
        },
      }
    );
    res.redirect(StatusCodes.MOVED_TEMPORARILY, "/userAddress");
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal server error");
  }
};

const loadReferralPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productsId"
    );
    const category = await Category.find({ isListed: true });
    res.render("referralPage", {
      isAuthenticated: req.isAuthenticated(),
      user: userData,
      cart,
      wishlist,
      category: category,
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

module.exports = {
  loadUserProfilePage,
  loadUserDetailsPage,
  editName,
  editEmail,
  emailVerifyOtp,
  emailResendOtp,
  loadUserAddressPage,
  loadAddAddress,
  addAddress,
  loadEditAddress,
  editAddress,
  deleteAddress,
  loadReferralPage,
};
