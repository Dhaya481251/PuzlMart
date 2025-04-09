const axios = require("axios");
const Order = require("../models/orderSchema");
const User = require("../models/userSchema");
const Product = require("../models/productSchema");

async function generateAccessToken() {
  try {
    const response = await axios({
      url: process.env.PAYPAL_BASE_URL + "/v1/oauth2/token",
      method: "POST",
      data: "grant_type=client_credentials",
      auth: {
        username: process.env.PAYPAL_CLIENT_ID,
        password: process.env.PAYPAL_SECRET,
      },
    });

    return response.data.access_token;
  } catch (error) {
    throw new Error("Failed to generate PayPal access token");
  }
}

async function convertCurrency(amountInINR) {
  try {
    const response = await axios.get(
      `https://api.exchangerate-api.com/v4/latest/INR`
    );
    const conversionRate = response.data.rates.USD;
    return (amountInINR * conversionRate).toFixed(2);
  } catch (error) {
    throw new Error("Failed to convert INR to USD");
  }
}

exports.createOrder = async (userId, id,deliveryChargeINR = 20) => {
  try {
    const order = await Order.findById({ _id: id })
      .populate("items.productId")
      .populate("userId");
    if (!order) {
      throw new Error("Order is not found");
    }

    const validItems = order.items.filter((item) => {
      const product = item.productId;
      return product && product.productName && product.salePrice;
    });

    const purchaseUnits = [];
    let itemTotalUSD = 0;
    for (const item of validItems) {
      const product = item.productId;
      const unitPriceINR = product.salePrice;
      const unitPriceUSD = await convertCurrency(unitPriceINR);
      const description = product.description || "No description provided";
      const truncatedDescription =
        description.length > 127 ? description.substring(0, 127) : description;

      itemTotalUSD += parseFloat(unitPriceUSD) * item.quantity;

      purchaseUnits.push({
        name: product.productName,
        description: truncatedDescription,
        quantity: item.quantity,
        unit_amount: {
          currency_code: "USD",
          value: unitPriceUSD,
        },
      });
    }
    const deliveryChargeUSD = await convertCurrency(deliveryChargeINR)
    const discountUSD = await convertCurrency(order.discount);
    const finalAmountUSD = (itemTotalUSD - discountUSD + parseFloat(deliveryChargeUSD)).toFixed(2);

    const return_url = process.env.NODE_ENV === 'production'
    ? "https://puzlmart.shop/paymentSuccessfull"
    : "http://localhost:3000/paymentSuccessfull";

    const cancel_url = process.env.NODE_ENV === 'production'
    ? "https://puzlmart.shop"
    : "http://localhost:3000";

    const accessToken = await generateAccessToken();

    const response = await axios({
      url: process.env.PAYPAL_BASE_URL + "/v2/checkout/orders",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + accessToken,
      },
      data: {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: "default",
            amount: {
              currency_code: "USD",
              value: finalAmountUSD,
              breakdown: {
                item_total: {
                  currency_code: "USD",
                  value: itemTotalUSD.toFixed(2),
                },
                discount: {
                  currency_code: "USD",
                  value: discountUSD,
                },
                shipping:{
                  currency_code:"USD",
                  value:deliveryChargeUSD
                }
              },
            },
            items: purchaseUnits,
          },
        ],
        application_context: {
          return_url,
          cancel_url,
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          brand_name: "Puzl Mart",
        },
      },
    });

    const approvalLink = response.data.links.find(
      (link) => link.rel === "approve"
    );
    if (!approvalLink) {
      throw new Error("Approval link not found in PayPal response");
    }

    return approvalLink.href;
  } catch (error) {
    throw new Error("Failed to create PayPal order");
  }
};

exports.capturePayment = async function capturePayment(id) {
  const accessToken = await generateAccessToken();

  const response = await axios({
    url: `${process.env.PAYPAL_BASE_URL}/v2/checkout/orders/${id}/capture`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.data.status === "COMPLETED") {
    await Order.findOneAndUpdate(
      { paypalOrderId: id },
      { paymentStatus: "Paid" },
      { new: true }
    );
    return "Paid";
  } else {
    await Order.findByIdAndUpdate(
      { paypalOrderId: id },
      { paymentStatus: "Pending" },
      { new: true }
    );
    return "Pending";
  }
};
