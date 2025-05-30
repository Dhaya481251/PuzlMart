const mongoose = require("mongoose");
const { Schema } = mongoose;
const { v4: uuidv4 } = require("uuid");

const orderSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  orderId: {
    type: String,
    default: () => uuidv4(),
    unique: true,
  },
  deliveryDate: {
    type: Date,
    required: true,
  },
  items: [
    {
      productId: {
        type: Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
      },
      regularPrice: {
        type: Number,
      },
      salePrice: {
        type: Number,
      },
      reviews: {
        type: Schema.Types.ObjectId,
        ref: "Review",
      },
      status: {
        type: String,
        enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Return Requested", "Returned"],
        default: "Pending",
      },
      cancellationReason: {
        type: String,
        default: "none",
      },
      returnReason: {
        type: String,
        default: "none",
      },
      returnStatus: {
        type: String,
        enum: ["Pending", "Accepted", "Declined"],
        default: "Pending",
      }
    }
  ],
  finalAmount: {
    type: Number,
    required: true,
  },
  discount: {
    type: Number,
    default: 0,
  },
  deliveryCharge: {
    type: Number,
  },
  addressId: {
    type: Schema.Types.ObjectId,
    ref: "Address",
    required: true,
  },
  addressDetails: {
    addressType: String,
    name: String,
    city: String,
    landMark: String,
    state: String,
    pincode: String,
    phone: String,
    altPhone: String,
  },
  invoiceDate: {
    type: Date,
  },
  paymentMethod: {
    type: String,
    enum: ["COD", "PayPal", "Razorpay", "Wallet"],
    required: true,
  },
  
  
  returnProcedureStartDate: {
    type: Date,
  },
  createdOn: {
    type: Date,
    default: Date.now,
    required: true,
  },
  couponApplied: {
    type: Boolean,
    default: false,
  },
  couponId: {
    type: Schema.Types.ObjectId,
    ref: "Coupon",
  },
  appliedCouponDetails: {
    name: {
      type: String,
    },
    discountType: {
      type: String,
      enum: ["Percentage", "Flat"],
    },
    discount: {
      type: Number,
    },
    maxDiscount: {
      type: Number,
    },
  },
  couponValidation: {
    isValid: {
      type: Boolean,
      default: false,
    },
  },
  paypalOrderId: {
    type: String,
  },
  paymentStatus: {
    type: String,
    enum: ["Pending", "Not paid", "Paid"],
    default: "Pending",
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
