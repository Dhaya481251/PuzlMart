const pageNotFound = async(req,res) => {
    try {
        res.render('page-404');
    } catch (error) {
        res.redirect('/pageNotFound')
    }
}

const loadHomepage = async(req,res) => {
    try {
        console.log('Home Page loaded');
        return res.render('home');
    } catch (error) {
        console.log('Home Page not found');
        res.status(500).send('Server Error');
    }
}

module.exports = {
    loadHomepage,
    pageNotFound
}