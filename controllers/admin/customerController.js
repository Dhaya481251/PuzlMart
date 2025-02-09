const User = require('../../models/userSchema');

const customerInfo = async(req,res) => {
    try {
        let search = '';
        if(req.query.search){
            search = req.query.search;
        }
        let page = 1;
        if(req.query.page){
            page = req.query.page;
        }
        const limit = 3;
        const userData = await User.find({
            isAdmin:false,
            $or:[
                {name:{$regex:'.*'+search+'.*'}},
                {email:{$regex:'.*'+search+'.*'}}
            ]
        })
        .limit(limit*1)
        .skip((page-1)*limit)
        .exec();
        
        const count = await User.find({
            isAdmin:false,
            $or:[
                {name:{$regex:'.*'+search+'.*'}},
                {email:{$regex:'.*'+search+'.*'}}
            ]
        }).countDocuments();

        res.render('customers',{
            data:userData,
            totalPages:Math.ceil(count/limit),
            currentPage:page
        })

    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

const customerBlocked = async(req,res) => {
    
    try{
       const userId =req.params.id;
       const user = await User.findByIdAndUpdate(userId,{isBlocked:true});
       
       if(!user){
        return res.status(404).json({message:'User not found'});
       }
       console.log('User blocked successfully');

       if(req.session.user === userId){
        req.session.destroy((err) => {
            if(err){
                console.log('Session destruction error',err.message);
                return res.status(500).send('Internal Server Error');
            }
            return res.redirect('/login')
        });
       }else{
        res.status(200).send('User blocked successfully');
       }
        

    }catch{
        res.status(500).send('Internal Server Erorr')
    }
}

const customerunBlocked = async(req,res) => {
    try {
        let userId = req.params.id
        await User.findByIdAndUpdate(userId,{isBlocked:false});
        res.status(200).send('Unblock the user successfully');
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
}

const searchUser = async (req, res) => {
  try {
    const searchString = req.body.query;
    let page =1;
    if(req.query.page){
      page = req.query.page;
    }
    const limit = 3;

    const users = await User.find({
      isAdmin:false,
      $or: [
        { email: { $regex: searchString, $options: "i" } },
        { name: { $regex: searchString, $options: "i" } },
      ],
    })
    .limit(limit*1)
    .skip((page-1)*limit)
    .exec();

    const count = await User.find({
      isAdmin:false,
      $or: [
        { email: { $regex: searchString, $options: "i" } },
        { name: { $regex: searchString, $options: "i" } },
      ],
    }).countDocuments();
    
    res.render("customers", {
        data:users,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
      });
    console.log(users);
  } catch (error) {
    console.log('Error while searching user : ', error);
    res.status(500).send('Internal Server Error');
  }
};

module.exports = {
    customerInfo,
    customerBlocked,
    customerunBlocked,
    searchUser
}