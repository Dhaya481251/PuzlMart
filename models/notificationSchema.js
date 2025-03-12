const mongoose = require("mongoose");
const { Schema } = mongoose;

const notificationSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  orderId: {
    type: Schema.Types.ObjectId,
    ref: "Order",
  },
  NotificationMessage: {
    type: String,
  },
  notificationType: {
    type: String,
    enum: ["returnRequest", "returnApproval", "returnDecline"],
  },
  createdOn: {
    type: Date,
    default: Date.now,
  },
});

const Notification = mongoose.model("Notification", notificationSchema);

module.exports = Notification;
