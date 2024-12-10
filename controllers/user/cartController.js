const User = require('../../models/userSchema');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');


const loadCart = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart) {
            return res.render('cart', { isAuthenticated: req.isAuthenticated(), user: userData, cart: null });
        }

        res.render('cart', { isAuthenticated: req.isAuthenticated(), user: userData, cart });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
};


const addToCart = async (req, res) => {
    try {
        const userId = req.session.user;
        const productId = req.params.id;
        const quantityToAdd = parseInt(req.body.quantity) || 1;

        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).send('Product not found');
        }

        
        if (quantityToAdd > product.quantity) {
            return res.status(400).send('Requested quantity exceeds available stock');
        }

        let cart = await Cart.findOne({ userId });

        if (cart) {
            
            const existingItemIndex = cart.items.findIndex(item => item.productId.toString() === productId);

            if (existingItemIndex > -1) {
                
                const existingItem = cart.items[existingItemIndex];
                if (existingItem.quantity + quantityToAdd > product.quantity) {
                    return res.status(400).send('Cannot add more than available stock');
                }

                existingItem.quantity += quantityToAdd;
                existingItem.productId.discount = product.regularPrice -product.salePrice;
                existingItem.totalPrice = existingItem.quantity * product.salePrice;
            } else {
                
                cart.items.push({
                    productId,
                    quantity: quantityToAdd
                });
            }
        } else {
            
            cart = new Cart({
                userId,
                items: [
                    {
                        productId,
                        quantity: quantityToAdd,
                    }
                ]
            });
        }

        await cart.save();
        res.redirect('/products');
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
};


const removeFromCart = async (req, res) => {
    try {
        const userId = req.session.user;
        const productId = req.params.id;

        let cart = await Cart.findOne({ userId });

        if (!cart) {
            return res.status(404).send('Cart not found');
        }

        
        cart.items = cart.items.filter(item => item.productId.toString() !== productId);

        await cart.save();
        res.redirect('/cart');
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
};

const increaseQuantity = async(req,res) => {
    try {
        const userId = req.session.user;
        const productId = req.params.id;
        

        const cart = await Cart.findOne({userId});

        if(!cart){
            return res.status(404).json({error:'cart not found'});
        }
        
        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({error:'Product not found'});

        const item = cart.items.find(item => item.productId.toString() === productId);
        if (!item) return res.status(404).json({error:'Item not in cart'});

        if (item.quantity + 1 > product.quantity) {
            return res.status(400).json({error:'Cannot add more than available stock'});
        }

        item.quantity += 1;
        item.productId.discount = product.regularPrice - product.salePrice;
        
        if(item.quantity > 10){
            item.quantity = 10;
            return res.status(400).json({error:'You can buy maximum 10 products'});
        }
        await cart.save();
        res.json({success:true,message:'Quantity increased successfully'})
       
    } catch (error) {
        console.error('increase quantity error',error);
        res.status(500).json({error:'Internal server error'});
    }
}

const decreaseQuantity = async(req,res) => {
    try {
        const userId = req.session.user;
        const productId = req.params.id;
        

        const cart = await Cart.findOne({userId});

        if(!cart){
            return res.status(404).json({error:'cart not found'});
        }
        
        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({error:'Product not found'});

        const item = cart.items.find(item => item.productId.toString() === productId);
        if (!item) return res.status(404).json({error:'Item not in cart'});

        if (item.quantity + 1 > product.quantity) {
            return res.status(400).json({error:'Cannot add more than available stock'});
        }

        item.quantity -= 1;
        item.productId.discount = product.regularPrice - product.salePrice;
        
        if(item.quantity < 1){
            return res.status(400).json({error:'You can buy min 1 products'});
        }
        await cart.save();
        res.json({success:true,message:'Quantity decreased successfully'})
       
    } catch (error) {
        console.error('increase quantity error',error);
        res.status(500).json({error:'Internal server error'});
    }
}

module.exports = {
    loadCart,
    addToCart,
    removeFromCart,
    increaseQuantity,
    decreaseQuantity
};
