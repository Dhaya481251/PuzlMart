const User = require("../models/userSchema");
const Cart = require("../models/cartSchema");

const userAuth = (req, res, next) => {
  if (req.session.user) {
    User.findById(req.session.user)
      .then((data) => {
        if (data) {
          if (data.isBlocked) {
            req.session.destroy((err) => {
              if (err) {
                console.log("Session destroy error : ", err.message);
              }
              return res.redirect("/login");
            });
          } else {
            res.locals.user = data;
            next();
          }
        } else {
          return res.redirect("/login");
        }
      })
      .catch((error) => {
        res.status(500).send("Internal Server Error");
      });
  } else {
    res.redirect("/login");
  }
};

const adminAuth = (req, res, next) => {
  if (req.session.admin) {
    next();
  } else {
    res.redirect("/admin/login");
  }
};

const validateCartState = async (req, res, next) => {
  try {
    const userId = req.session.user;
    const cart = await Cart.findOne({ userId }).populate("items.productId");

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.redirect("/products"); 
    }
    req.cart = cart;
    next(); 
  } catch (error) {
    console.error("Error validating cart state:", error);
    res.status(500).send("Internal Server Error");
  }
};

module.exports = {
  userAuth,
  adminAuth,
  validateCartState
};
