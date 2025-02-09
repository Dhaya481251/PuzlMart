const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Order = require('../../models/orderSchema');
const moment = require('moment');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');



const loadLogin = async(req,res) => {
    try {
        if(req.session.admin){
            res.redirect('/admin')
        }
        console.log('Admin login page');
        return res.render('admin-login');
    } catch (error) {
        res.status(500).send('Sever Internal Error');
    }
} 

const login = async(req,res) => {
    try {
        const {email,password} = req.body;
        const admin = await User.findOne({email,isAdmin:true});
        if(admin){
            const passwordMatch = await bcrypt.compare(password,admin.password);
            if(passwordMatch){
                req.session.admin = true;
                console.log('Admin logged in successfully');
                return res.render('admin-dashboard')
            }else{
                return res.render('admin-login',{message:'Incorrect Password'})
            }
        }else{
            return res.render('admin-login',{message:'Admin not found'});
        }
    } catch (error) {
        console.log('login-error',error);
        return res.status(500).send('Internal server error')
    }
}

const loadDashboard = async(req,res) => {
    if(req.session.admin){
        try {
            console.log('Admin Dashboard');
            res.render('admin-dashboard');
        } catch (error) {
            res.status(500).send('Internal Server Error')
        }
    }
}

const logout = async(req,res) => {
    try {
        req.session.destroy(err => {
            if(err){
                console.log('Error destroying session',err);
                return res.redirect('/pageerror');
            }
            console.log('Admin logged out successfully')
            res.redirect('/admin/login');
        })
    } catch (error) {
        console.log(("unexpected error during logout",error));
        res.status(500).send('Internal Server Error')
    }
}

const salesReport = async(req,res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page-1)*limit;

        const orders = await Order.find({status:'Delivered'})
        .populate('items.productId')
        .sort({createdOn:-1})
        .skip(skip)
        .limit(limit);
        let totalOrderAmount = 0;
        let totalDiscount = 0;
        
        orders.forEach(order => {
            order.items.forEach(item => {
                const total = order.finalAmount;
                totalOrderAmount += total;
                totalDiscount += order.discount;
                

            });
        });
        const totalOrders = await Order.find({status:'Delivered'}).countDocuments();
        const totalPages = Math.ceil(totalOrders/limit);
        
        console.log('Sale Report loaded');
        res.render('salesReport',{
            orders,
            currentPage:page,
            totalPages:totalPages,
            totalOrders:totalOrders,
            totalOrderAmount:totalOrderAmount,
            totalDiscount:totalDiscount,
            
        });
    } catch (error) {
        console.error('Sales report page loading error',error);
        res.status(500).send('Internal Server Error');
    }
}

const filterSalesReport = async(req,res) => {
    try {
        let startDate;
        let endDate;
        const filter = req.query.filter;
        if(filter === '1 Day'){
            startDate = moment().subtract(1,'days').startOf('day').toDate();
            endDate = moment().endOf('day').toDate();
        }else if(filter === '1 Week'){
            startDate = moment().subtract(1,'weeks').startOf('day').toDate();
            endDate = moment().endOf('day').toDate();
        }else if(filter === '1 Month'){
            startDate = moment().subtract(1,'months').startOf('day').toDate();
            endDate = moment().endOf('day').toDate();
        }else if(filter === '1 Year'){
            startDate = moment().subtract(1,'years').startOf('day').toDate();
            endDate = moment().endOf('day').toDate();
        }else if(filter === 'Custom date'){
            const customStartDate = req.query.startDate;
            const customEndDate = req.query.endDate
            startDate = moment(customStartDate, 'YYYY-MM-DD').startOf('day').toDate();
            endDate = moment(customEndDate, 'YYYY-MM-DD').endOf('day').toDate();
        }
    
        
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page-1)*limit;

        const orders = await Order.find({status:'Delivered',deliveryDate:{$gte:startDate,$lte:endDate}})
        .populate('items.productId')
        .sort({createdOn:-1})
        .skip(skip)
        .limit(limit);
        const totalOrders = await Order.countDocuments({status:'Delivered',deliveryDate:{$gte:startDate,$lte:endDate}}).countDocuments();
        const totalPages = Math.ceil(totalOrders/limit);
        let totalOrderAmount = 0;
        let totalDiscount = 0;

        orders.forEach(order => {
            totalOrderAmount += order.finalAmount;
            totalDiscount += order.discount;
        });

        res.render('salesReport',{
            orders,
            totalOrders,
            totalOrderAmount,
            totalDiscount,
            currentPage:page,
            totalPages:totalPages,
        });
    } catch (error) {
        console.error('Error filtering sales report : ',error);
        res.status(500).send('Internal server error');
    }
}

const downloadPDF = async(req,res) => {
    try {
        const orders = await Order.find({status:'Delivered'}).populate('items.productId');
        const doc = new PDFDocument({autoFirstPage:false});

        doc.addPage();
        doc.fontSize(18).text('Sales Report',{align:'center'});
        
        const headers = ['Product Name','Regular Price','Sales Price','Quantity','Discount','Order Status','Payment Method','Payment Status','Total'];
        const startX = 10;
        const startY = 100;
        const cellHeight = 50;
        const cellWidth = 50;
        let currentY = startY;
        
        doc.fontSize(12).font('Helvetica-Bold');
        let currentX = startX;
        headers.forEach(header => {
            doc.text(header,currentX,currentY,{width:cellWidth,align:'center'});
            currentX += cellWidth;
        });

        currentY += cellHeight;
        doc.moveTo(startX,currentY).lineTo(startX+cellWidth*headers.length,currentY).stroke();
        currentY += cellHeight;
        doc.font('Helvetica').fontSize(10);

        let totalOrderAmount = 0;
        let totalDiscount = 0;
        const totalOrders = await Order.find({status:'Delivered'}).countDocuments();
        orders.forEach(order => {
            order.items.forEach(item => {
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
                    total
                ]

                rowData.forEach((data,index) => {
                    doc.text(data.toString(),currentX,currentY,{width:cellWidth,align:'center'});
                    currentX += cellWidth;
                });
                
                currentY += cellHeight;
                if (currentY + cellHeight > doc.page.height - doc.page.margins.bottom) { 
                    doc.addPage(); currentY = startY; 
                }
            });
        });

        doc.moveTo(startX,currentY).lineTo(startX + cellWidth*headers.length,currentY).stroke();
        
        
        currentY+=20;

        const boxPadding = 10;
        const boxHeight = 120;
        const boxWidth = cellWidth*headers.length;
        
        if (currentY + boxHeight + boxPadding > doc.page.height - doc.page.margins.bottom) { 
            doc.addPage(); currentY = startY; 
        }

        doc.rect(startX,currentY,boxWidth, boxHeight).stroke();

        currentY += boxPadding;
    
        doc.fontSize(12).font('Helvetica-Bold').text('Report Summary',startX + boxPadding,currentY);
        currentY+=20;
        doc.fontSize(10).font('Helvetica');
        doc.text(`Total Sales : ${totalOrders}`,startX + boxPadding,currentY);
        currentY += 20;
        doc.text(`Total Order Amount : ${totalOrderAmount}`,startX + boxPadding, currentY);
        currentY += 20;
        doc.text(`Total Discount : ${totalDiscount}`,startX + boxPadding, currentY);
        

        doc.end();
        doc.pipe(res);
    } catch (error) {
        console.error('Downloading sales report in pdf format error : ',error);
        res.status(500).send('Internal server error');
    }
}

const downloadEXCEL = async(req,res) => {
    try {
        const orders = await Order.find({status:'Delivered'}).populate('items.productId');
        const data = [];

        orders.forEach(order => {
            order.items.forEach(item => {
                data.push({
                    productName:item.productId.productName,
                    RegularPrice:item.productId.regularPrice,
                    SalePrice:item.productId.salePrice,
                    Quantity:item.quantity,
                    Discount:order.discount,
                    Status:order.status,
                    PaymentMethod:order.paymentMethod,
                    PaymentStatus:order.paymentStatus,
                    Total:item.quantity*item.productId.salePrice
                });
            });
        });
        if(data.length===0){
            return res.status(400).send('No data is available');
        }
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb,ws,'Sales Report');

        const excelBuffer = XLSX.write(wb,{bookType:'xlsx',type:'buffer'});
        
        res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition','attachment;filename=salesReport.xlsx');
        
        res.send(excelBuffer);
    } catch (error) {
        console.error('Downloading sales report in excel format error : ',error);
        res.status(500).send('Internal server error');
    }
}



module.exports = {
    loadLogin,
    login,
    loadDashboard,
    logout,
    salesReport,
    filterSalesReport,
    downloadPDF,
    downloadEXCEL,
    
}