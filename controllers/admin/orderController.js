const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Notification = require("../../models/notificationSchema");
const mongoose = require("mongoose");

const listOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const orders = await Order.find()
      .populate("items.productId")
      .sort({ createdOn: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    const totalOrders = await Order.countDocuments();
    const totalPages = Math.ceil(totalOrders / limit);

    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });

    res.render("orders", {
      orders,
      currentPage: page,
      totalPages: totalPages,
      totalOrders: totalOrders,
      notifications,
    });
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

const changeOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (
      !status ||
      ![
        "Pending",
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled",
        "Return Request",
        "Returned",
      ].includes(status)
    ) {
      return res.status(400).send("Invalid status");
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).send("Order not found");
    }

    order.status = status;
    if (order.status === "Delivered") {
      order.deliveryDate = new Date(Date.now());
      order.paymentStatus = "Paid";
      await order.save();
    }
    await order.save();

    res.redirect("/admin/orders");
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).send("Order not found");
    }

    if (order.status !== "Pending") {
      return res
        .status(400)
        .send("Order cannot be cancelled in its current status");
    }

    order.status = "Cancelled";
    await order.save();

    res.redirect("/admin/orders");
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};
const moreDetails = async (req, res) => {
  try {
    const id = req.params.id;
    const order = await Order.findById(id).populate("items.productId");
    const notifications = await Notification.find()
      .populate("orderId")
      .sort({ createdOn: -1 });
    if (!order) {
      return res.status(404).send("Order not found");
    }

    res.render("orderMoreDetails", {
      orders: order,
      notifications: notifications,
    });
  } catch (error) {
    res.status(500).send("Internal server error");
  }
};

const handleReturnRequest = async (req, res) => {
  try {
    const id = req.params.id;
    const { action } = req.body;

    if (action !== "approve" && action !== "decline") {
      return res.status(400).json({ message: "Invalid action provided" });
    }

    const order = await Order.findById({ _id: id });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (action === "approve") {
      order.returnStatus = "Accepted";
      order.returnProcedureStartDate = new Date();
      order.status = "Returned";
      await order.save();

      const notification = new Notification({
        userId: order.userId,
        orderId: order._id,
        NotificationMessage:
          "Return request accepted. The product will be collected within 2 days, and the amount will be credited to your wallet today.",
        notificationType: "returnApproval",
      });
      await notification.save();

      if (order.paymentStatus === "Paid") {
        const user = await User.findById(order.userId);
        user.wallet.balance =
          (user.wallet.balance || 0) + (order.finalAmount || 0);

        const newTransaction = {
          transactionsType: "credit",
          amount: order.finalAmount,
          reason: "Order Return Refund",
          date: new Date(),
        };
        user.wallet.transactions.push(newTransaction);

        await user.save();
      }

      res.status(200).json({
        message: "Return request approved and refund processed",
        type: "success",
      });
    } else if (action === "decline") {
      order.returnStatus = "Declined";
      await order.save();

      const notification = new Notification({
        userId: order.userId,
        orderId: order._id,
        NotificationMessage:
          "Return request declined. This product cannot be returned for a reason.",
        notificationType: "returnDecline",
      });
      await notification.save();

      res
        .status(200)
        .json({ message: "Return request declined", type: "success" });
    }
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
};

module.exports = {
  listOrders,
  changeOrderStatus,
  cancelOrder,
  moreDetails,
  handleReturnRequest,
};
