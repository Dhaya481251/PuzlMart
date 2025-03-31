const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const Product = require("../../models/productSchema");
const Coupon = require("../../models/couponSchema");
const Offer = require("../../models/offerSchema");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Order = require("../../models/orderSchema");
const moment = require("moment");
const PDFDocument = require("pdfkit");
const XLSX = require("xlsx");
const Notification = require("../../models/notificationSchema");
const {StatusCodes,ReasonPhrases} = require('http-status-codes');

const fetchDashboardData = async() => {
  const users = await User.find({isAdmin:false});
  const orders = await Order.find()
  .sort({createdOn:-1})
  .populate('items.productId')
  .populate('userId');
  const products = await Product.find();
  const notifications = await Notification.find({notificationType:'returnRequest'})
  .populate('orderId')
  .sort({createdOn:-1});

  const topSellingProducts = await Order.aggregate([
    {$unwind:'$items'},
    {$group:{_id:'$items.productId',totalQuantitySold:{$sum:'$items.quantity'}}},
    {$sort:{totalQuantitySold:-1}},
    {$limit:10},
    {$lookup:{from:'products',localField:'_id',foreignField:'_id',as:'productDetails'}},
    {$unwind:'$productDetails'}
  ]);
  const topSellingCategories = await Order.aggregate([
    {$unwind:'$items'},
    {$lookup:{from:'products',localField:'items.productId',foreignField:'_id',as:'productDetails'}},
    {$unwind:'$productDetails'},
    {$group:{_id:'$productDetails.category',totalQuantitySold:{$sum:'$items.quantity'}}},
    {$sort:{totalQuantitySold:-1}},
    {$limit:10},
    {$lookup:{from:'categories',localField:'_id',foreignField:'_id',as:'categoryDetails'}},
    {$unwind:'$categoryDetails'},
    {$project:{_id:'$categoryDetails',totalQuantitySold:1}}
  ])

  const topSellingBrands = await Order.aggregate([
    {$unwind:'$items'},
    {$lookup:{from:'products',localField:'items.productId',foreignField:'_id',as:'productDetails'}},
    {$unwind:'$productDetails'},
    {$group:{_id:'$productDetails.brand',totalQuantitySold:{$sum:'$items.quantity'}}},
    {$sort:{totalQuantitySold:-1}},
    {$limit:10},
    {$lookup:{from:'brands',localField:'_id',foreignField:'brandName',as:'brandDetails'}},
    {$unwind:'$brandDetails'},
    {$project:{brandName:'$_id',brandImage:'$brandDetails.brandImage',totalQuantitySold:1}}
  ])
  return {users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands};
};

const fetchSalesReportData = async() => {
  
  const limit = 4;

  const orders = await Order.find({status:'Delivered'})
  .populate('items.productId')
  

  let totalOrderAmount = 0;
  let totalDiscount = 0;

  orders.forEach((order) => {
    order.items.forEach((item) => {
      const total = order.finalAmount;
      totalOrderAmount += total;
      totalDiscount += order.discount;
    });
  });
  const totalOrders = await Order.find({
    status:'Delivered',
  })
  .countDocuments();

  const totalPages = Math.ceil(totalOrders/limit);

  const notifications = await Notification.find({
    notificationType:'returnRequest'
  })
  .populate('orderId')
  .sort({createdOn:-1});
  
  return {orders,totalPages,totalOrders,totalOrderAmount,totalDiscount,notifications}
}
const loadLogin = async (req, res) => {
  try {
    if (req.session.admin) {
      res.redirect("/admin");
    }

    return res.render("admin-login",{errorMessage:null});
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('admin-login',{errorMessage:'Something went wrong! Please try again.'});
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await User.findOne({ email, isAdmin: true });
    if (admin) {
      const passwordMatch = await bcrypt.compare(password, admin.password);
      if (passwordMatch) {
        req.session.admin = true;

        return res.redirect(StatusCodes.MOVED_TEMPORARILY, "/admin");
      } else {
        return res.render("admin-login", {errorMessage:null, message: "Incorrect Password" });
      }
    } else {
      return res.render("admin-login", {errorMessage:null, message: "Admin not found" });
    }
  } catch (error) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('admin-login',{errorMessage:'Something went wrong! Please try again.'});
  }
};

const loadDashboard = async (req, res) => {
  if (req.session.admin) {
    try {
      const users = await User.find({ isAdmin: false });
      const orders = await Order.find()
        .sort({ createdOn: -1 })
        .populate("items.productId")
        .populate("userId");
      const products = await Product.find();
      const notifications = await Notification.find({
        notificationType: "returnRequest",
      })
        .populate("orderId")
        .sort({ createdOn: -1 });
      const topSellingProducts = await Order.aggregate([
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.productId",
            totalQuantitySold: { $sum: "$items.quantity" },
          },
        },
        { $sort: { totalQuantitySold: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "productDetails",
          },
        },
        { $unwind: "$productDetails" },
      ]);

      const topSellingCategories = await Order.aggregate([
        { $unwind: "$items" },
        {
          $lookup: {
            from: "products",
            localField: "items.productId",
            foreignField: "_id",
            as: "productDetails",
          },
        },
        { $unwind: "$productDetails" },
        {
          $group: {
            _id: "$productDetails.category",
            totalQuantitySold: { $sum: "$items.quantity" },
          },
        },
        { $sort: { totalQuantitySold: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "categories",
            localField: "_id",
            foreignField: "_id",
            as: "categoryDetails",
          },
        },
        { $unwind: "$categoryDetails" },
        {
          $project: {
            _id: "$categoryDetails",
            totalQuantitySold: 1,
          },
        },
      ]);

      const topSellingBrands = await Order.aggregate([
        { $unwind: "$items" },
        {
          $lookup: {
            from: "products",
            localField: "items.productId",
            foreignField: "_id",
            as: "productDetails",
          },
        },
        { $unwind: "$productDetails" },
        {
          $group: {
            _id: "$productDetails.brand",
            totalQuantitySold: { $sum: "$items.quantity" },
          },
        },
        { $sort: { totalQuantitySold: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "brands",
            localField: "_id",
            foreignField: "brandName",
            as: "brandDetails",
          },
        },
        { $unwind: "$brandDetails" },
        {
          $project: {
            brandName: "$_id",
            brandImage: "$brandDetails.brandImage",
            totalQuantitySold: 1,
          },
        },
      ]);

      res.render("admin-dashboard", {
        users,
        orders,
        products,
        topSellingProducts,
        topSellingCategories,
        topSellingBrands,
        notifications,
        errorMessage:null
      });
    } catch (error) {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('admin-login',{errorMessage:'Something went wrong! Please try again.'});
    }
  }
};

const logout = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        return res.redirect("/pageerror");
      }

      res.redirect("/admin/login");
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal Server Error");
  }
};

const salesReport = async (req, res) => {
  const {users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands} = await fetchDashboardData();
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;

    const orders = await Order.find({ status: "Delivered" })
      .populate("items.productId")
      .sort({ createdOn: -1 })
      .skip(skip)
      .limit(limit);
    let totalOrderAmount = 0;
    let totalDiscount = 0;

    orders.forEach((order) => {
      order.items.forEach((item) => {
        const total = order.finalAmount;
        totalOrderAmount += total;
        totalDiscount += order.discount;
      });
    });
    const totalOrders = await Order.find({
      status: "Delivered",
    }).countDocuments();
    const totalPages = Math.ceil(totalOrders / limit);

    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });

    res.render("salesReport", {
      orders,
      currentPage: page,
      totalPages: totalPages,
      totalOrders: totalOrders,
      totalOrderAmount: totalOrderAmount,
      totalDiscount: totalDiscount,
      notifications,
      errorMessage:null
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('admin-dashboard',{errorMessage:'Something went wrong! Please try again',users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands});
  }
};
const filterSalesReport = async (req, res) => {
  const {orders,totalPages,totalOrders,totalOrderAmount,totalDiscount,notifications} = fetchSalesReportData();
  const page = parseInt(req.query.page) || 1;
  try {
    const filter = req.body.filter;
    const filterMap = {
      "1 Day": [1, "days"],
      "1 Week": [1, "weeks"],
      "1 Month": [1, "months"],
      "1 Year": [1, "years"],
    };

    let startDate;
    let endDate = moment().endOf("day").toDate();

    if (filterMap[filter]) {
      const [amount, unit] = filterMap[filter];
      startDate = moment().subtract(amount, unit).startOf("day").toDate();
    } else if (filter === "Custom date") {
      startDate = moment(req.body.startDate, "YYYY-MM-DD")
        .startOf("day")
        .toDate();
      endDate = moment(req.body.endDate, "YYYY-MM-DD").endOf("day").toDate();
    } else {
      return res.status(400).send("Invalid filter");
    }

    
    const limit = 4;
    const skip = (page - 1) * limit;

    const orders = await Order.find({
      status: "Delivered",
      deliveryDate: { $gte: startDate, $lte: endDate },
    })
      .populate("items.productId")
      .sort({ createdOn: -1 })
      .skip(skip)
      .limit(limit);

    const totalOrders = await Order.countDocuments({
      status: "Delivered",
      deliveryDate: { $gte: startDate, $lte: endDate },
    });
    const totalPages = Math.ceil(totalOrders / limit);

    const totalOrderAmount = orders.reduce(
      (acc, order) => acc + order.finalAmount,
      0
    );
    const totalDiscount = orders.reduce(
      (acc, order) => acc + order.discount,
      0
    );
    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });
    res.render("salesReport", {
      orders,
      totalOrders,
      totalOrderAmount,
      totalDiscount,
      currentPage: page,
      totalPages: totalPages,
      notifications,
      errorMessage:null
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('salesReport',{errorMessage:'Something went wrong! Please try again.',orders,currentPage:page,totalPages,totalOrders,totalOrderAmount,totalDiscount,notifications});
  }
};

const downloadPDF = async (req, res) => {
  const {orders,totalPages,totalOrders,totalOrderAmount,totalDiscount,notifications} = fetchSalesReportData();
  const page = parseInt(req.query.page) || 1;
  try {
    const orders = await Order.find({ status: "Delivered" }).populate(
      "items.productId"
    );
    const doc = new PDFDocument({ autoFirstPage: false });

    doc.addPage();
    doc.fontSize(18).text("Sales Report", { align: "center" });

    const headers = [
      "Product Name",
      "Regular Price",
      "Sales Price",
      "Quantity",
      "Discount",
      "Order Status",
      "Payment Method",
      "Payment Status",
      "Total",
    ];
    const startX = 10;
    const startY = 100;
    const cellHeight = 50;
    const cellWidth = 50;
    let currentY = startY;

    doc.fontSize(12).font("Helvetica-Bold");
    let currentX = startX;
    headers.forEach((header) => {
      doc.text(header, currentX, currentY, {
        width: cellWidth,
        align: "center",
      });
      currentX += cellWidth;
    });

    currentY += cellHeight;
    doc
      .moveTo(startX, currentY)
      .lineTo(startX + cellWidth * headers.length, currentY)
      .stroke();
    currentY += cellHeight;
    doc.font("Helvetica").fontSize(10);

    let totalOrderAmount = 0;
    let totalDiscount = 0;
    const totalOrders = await Order.find({
      status: "Delivered",
    }).countDocuments();
    orders.forEach((order) => {
      order.items.forEach((item) => {
        const total = order.finalAmount;
        totalOrderAmount += total;
        totalDiscount += order.discount;

        currentX = startX;
        const rowData = [
          item.productId.productName,
          item.productId.regularPrice,
          item.productId.salePrice,
          item.quantity,
          order.discount,
          order.status,
          order.paymentMethod,
          order.paymentStatus,
          total,
        ];

        rowData.forEach((data, index) => {
          doc.text(data.toString(), currentX, currentY, {
            width: cellWidth,
            align: "center",
          });
          currentX += cellWidth;
        });

        currentY += cellHeight;
        if (currentY + cellHeight > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          currentY = startY;
        }
      });
    });

    doc
      .moveTo(startX, currentY)
      .lineTo(startX + cellWidth * headers.length, currentY)
      .stroke();

    currentY += 20;

    const boxPadding = 10;
    const boxHeight = 120;
    const boxWidth = cellWidth * headers.length;

    if (
      currentY + boxHeight + boxPadding >
      doc.page.height - doc.page.margins.bottom
    ) {
      doc.addPage();
      currentY = startY;
    }

    doc.rect(startX, currentY, boxWidth, boxHeight).stroke();

    currentY += boxPadding;

    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Report Summary", startX + boxPadding, currentY);
    currentY += 20;
    doc.fontSize(10).font("Helvetica");
    doc.text(`Total Sales : ${totalOrders}`, startX + boxPadding, currentY);
    currentY += 20;
    doc.text(
      `Total Order Amount : ${totalOrderAmount}`,
      startX + boxPadding,
      currentY
    );
    currentY += 20;
    doc.text(
      `Total Discount : ${totalDiscount}`,
      startX + boxPadding,
      currentY
    );

    doc.end();
    doc.pipe(res);
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('salesReport',{errorMessage:'Something went wrong! Please try again.',orders,currentPage:page,totalPages,totalOrders,totalOrderAmount,totalDiscount,notifications});
  }
};

const downloadEXCEL = async (req, res) => {
  const {orders,totalPages,totalOrders,totalOrderAmount,totalDiscount,notifications} = fetchSalesReportData();
  const page = parseInt(req.query.page) || 1;
  try {
    const orders = await Order.find({ status: "Delivered" }).populate(
      "items.productId"
    );
    const data = [];

    orders.forEach((order) => {
      order.items.forEach((item) => {
        data.push({
          productName: item.productId.productName,
          RegularPrice: item.productId.regularPrice,
          SalePrice: item.productId.salePrice,
          Quantity: item.quantity,
          Discount: order.discount,
          Status: order.status,
          PaymentMethod: order.paymentMethod,
          PaymentStatus: order.paymentStatus,
          Total: item.quantity * item.productId.salePrice,
        });
      });
    });
    if (data.length === 0) {
      return res.status(400).send("No data is available");
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Report");

    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment;filename=salesReport.xlsx"
    );

    res.send(excelBuffer);
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('salesReport',{errorMessage:'Something went wrong! Please try again.',orders,currentPage:page,totalPages,totalOrders,totalOrderAmount,totalDiscount,notifications});
  }
};

const getChartData = async (req, res) => {
  const {users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands} = await fetchDashboardData();
  try {
    const { filter } = req.query;

    let startDate, endDate;
    const now = new Date();
    switch (filter) {
      case "daily":
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case "weekly":
        startDate = new Date(now.setDate(now.getDate() - 7));
        endDate = new Date();
        break;
      case "monthly":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case "yearly":
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        break;
      default:
        return res.status(400).json({ error: "Invalid filter type" });
    }

    const userCount = await User.find().countDocuments({
      createdOn: { $gte: startDate, $lte: endDate },
    });
    const orderCount = await Order.countDocuments({
      createdOn: { $gte: startDate, $lte: endDate },
    });
    const productCount = await Product.countDocuments({
      createdOn: { $gte: startDate, $lte: endDate },
    });

    const categoryRevenue = await Order.aggregate([
      { $match: { createdOn: { $gte: startDate, $lte: endDate } } },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      { $unwind: "$productDetails" },
      {
        $group: {
          _id: "$productDetails.category",
          totalRevenue: {
            $sum: {
              $multiply: ["$items.quantity", "$productDetails.salePrice"],
            },
          },
          totalOrders: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "categoryDetails",
        },
      },
      { $unwind: "$categoryDetails" },
      {
        $project: {
          _id: "$categoryDetails.name",
          totalRevenue: 1,
          totalOrders: 1,
        },
      },
    ]);

    res.json({
      barChartData: [userCount, orderCount, productCount],
      doughnutChartData: categoryRevenue,
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('admin-dashboard',{errorMessage:'Something went wrong! Please try again',users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands});
  }
};

const searchAll = async (req, res) => {
  const {users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands} = await fetchDashboardData();
  try {
    const searchString = req.body.query;
    const searchType = req.body.type;
    let page = req.query.page || 1;
    const limit = 10;
    let result, count, view;
    const notifications = await Notification.find({
      notificationType: "returnRequest",
    })
      .populate("orderId")
      .sort({ createdOn: -1 });

    switch (searchType) {
      case "users":
        result = await User.find({
          isAdmin: false,
          $or: [
            { email: { $regex: searchString, $options: "i" } },
            { name: { $regex: searchString, $options: "i" } },
          ],
        })
          .limit(limit)
          .skip((page - 1) * limit)
          .exec();

        count = await User.find({
          isAdmin: false,
          $or: [
            { email: { $regex: searchString, $options: "i" } },
            { name: { $regex: searchString, $options: "i" } },
          ],
        }).countDocuments();
        view = "customers";
        break;

      case "categories":

        result = await Category.find({
          name: { $regex: searchString, $options: "i" },
        })
          .limit(limit)
          .skip((page - 1) * limit)
          .exec();

        count = await Category.find({
          name: { $regex: searchString, $options: "i" },
        }).countDocuments();
        view = "category";
        break;

      case "brands":
        result = await Brand.find({
          brandName: { $regex: searchString, $options: "i" },
        })
          .limit(limit)
          .skip((page - 1) * limit)
          .exec();

        count = await Brand.find({
          brandName: { $regex: searchString, $options: "i" },
        }).countDocuments();
        view = "brands";
        break;

      case "products":
        result = await Product.find({
          productName: { $regex: searchString, $options: "i" },
        }).populate('category')
          .limit(limit)
          .skip((page - 1) * limit)
          .exec();

        count = await Product.find({
          productName: { $regex: searchString, $options: "i" },
        }).countDocuments();
        view = "product";
        break;

      case "orders":
        let dateFilter = {};
        if (searchString && !isNaN(Date.parse(searchString))) {
          const parsedDate = new Date(searchString);
          dateFilter = { deliveryDate: parsedDate };
        }
        result = await Order.find({
          $or: [
            dateFilter,
            { paymentMethod: { $regex: searchString, $options: "i" } },
            { paymentStatus: { $regex: searchString, $options: "i" } },
            { status: { $regex: searchString, $options: "i" } },
          ],
        })
          .limit(limit)
          .skip((page - 1) * limit)
          .exec();

        count = await Order.find({
          $or: [
            dateFilter,
            { paymentMethod: { $regex: searchString, $options: "i" } },
            { paymentStatus: { $regex: searchString, $options: "i" } },
            { status: { $regex: searchString, $options: "i" } },
          ],
        }).countDocuments();
        view = "orders";
        break;

      case "coupons":
        result = await Coupon.find({
          name: { $regex: searchString, $options: "i" },
        })
          .limit(limit)
          .skip((page - 1) * limit)
          .exec();

        count = await Coupon.find({
          name: { $regex: searchString, $options: "i" },
        }).countDocuments();
        view = "coupons";
        break;

      case "offers":
        result = await Offer.find({
          $or: [
            { offerType: { $regex: searchString, $options: "i" } },
            { discountType: { $regex: searchString, $options: "i" } },
          ],
        })
          .limit(limit)
          .skip((page - 1) * limit)
          .exec();

        count = await Offer.find({
          $or: [
            { offerType: { $regex: searchString, $options: "i" } },
            { discountType: { $regex: searchString, $options: "i" } },
          ],
        }).countDocuments();
        view = "offer";
        break;

      default:
        return res.status(400).send("Invalid search type");
    }

    if (!view) {
      return res.status(400).send("View not found for the given search type.");
    }

    if (searchType === "users") {
      res.render(view, {
        data: result,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        notifications,
        errorMessage:null
      });
    } else if (searchType === "categories") {
      res.render(view, {
        cat: result,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        notifications,
        errorMessage:null
      });
    } else if (searchType === "brands") {
      res.render(view, {
        data: result,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        notifications,
        errorMessage:null
      });
    } else if (searchType === "products") {
      res.render(view, {
        data: result,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        notifications,
        errorMessage:null
      });
    } else if (searchType === "orders") {
      res.render(view, {
        orders: result,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        notifications,
        errorMessage:null
      });
    } else if (searchType === "coupons") {
      res.render(view, {
        coupons: result,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        notifications,
        errorMessage:null
      });
    } else if (searchType === "offers") {
      res.render(view, {
        offers: result,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        notifications,
        errorMessage:null
      });
    }
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('admin-dashboard',{errorMessage:'Something went wrong! Please try again.',users,orders,products,notifications,topSellingProducts,topSellingCategories,topSellingBrands});
  }
};

module.exports = {
  loadLogin,
  login,
  loadDashboard,
  logout,
  salesReport,
  filterSalesReport,
  downloadPDF,
  downloadEXCEL,
  getChartData,
  searchAll,
};
