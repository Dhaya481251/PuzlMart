const User = require('../../models/userSchema');

const loadWallet = async(req,res) => {
    try {
        const userId = req.session.user;
        const user = await User.findById(userId);

        res.render('wallet',{user});
    } catch (error) {
        console.error('Loading wallet page error');
        res.status(500).send('Internal Server Error');
    }
}

module.exports = {
    loadWallet
}