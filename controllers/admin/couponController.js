const Coupon = require("../../models/couponSchema");
const Notification = require("../../models/notificationSchema");
const getCoupons = async (req, res) => {
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
    });
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

const loadAddCouponPage = async (req, res) => {
  try {
    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });

    res.render("addCoupon", { notifications });
  } catch (error) {
    res.status(500).send("Internal Server Error");
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
    if (existingCoupon) {
      res.status(400).json({ message: "Coupon already exists", type: "error" });
    } else {
      if (discountType === "Percentage") {
        if (discount < 1 || discount > 90) {
          return res
            .status(400)
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
            .status(200)
            .json({ message: "Coupon added successfully", type: "success" });
        }
      } else if (discountType === "Flat") {
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
          .status(200)
          .json({ message: "Coupon added successfully", type: "success" });
      }
    }
  } catch (error) {
    res.status(500).json({ message: "Internal server error", type: "error" });
  }
};

const removeCoupon = async (req, res) => {
  try {
    const id = req.params.id;
    const removeCoupon = await Coupon.findByIdAndDelete(id);

    if (!removeCoupon) {
      res.status(404).json({ status: false, message: "Coupon not found" });
    }

    return res
      .status(200)
      .json({ message: "Category deleted successfully", removeCoupon });
  } catch (error) {
    res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

const activeCoupon = async (req, res) => {
  try {
    let id = req.query.id;
    await Coupon.updateOne({ _id: id }, { $set: { isActive: true } });
    res.redirect("/admin/coupons");
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

const inactiveCoupon = async (req, res) => {
  try {
    let id = req.query.id;
    await Coupon.updateOne({ _id: id }, { $set: { isActive: false } });
    res.redirect("/admin/coupons");
  } catch (error) {
    res.status(500).send("Internal Server Error");
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
