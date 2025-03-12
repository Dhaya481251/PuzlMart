const mongoose = require("mongoose");
const { Schema } = mongoose;

const couponSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  code: {
    type: String,
    required: true,
    unique: true,
  },
  createdOn: {
    type: Date,
    default: Date.now,
    required: true,
  },
  expireOn: {
    type: Date,
    required: true,
  },
  minimumPrice: {
    type: Number,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  appliedusers: [
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
      appliedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  discountType: {
    type: String,
    enum: ["Percentage", "Flat"],
    required: true,
  },
  discount: {
    type: Number,
    required: true,
  },
  usageLimit: {
    type: Number,
    default: 1,
  },
  usedCount: {
    type: Number,
    default: 0,
  },
});

const Coupon = mongoose.model("Coupon", couponSchema);

module.exports = Coupon;
