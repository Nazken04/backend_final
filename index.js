const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const ejs = require('ejs');
const session = require('express-session');
const nodemailer = require('nodemailer');
const axios = require('axios');
const Chart = require('chart.js');
const path = require('path');


const MongoDBStore = require('connect-mongodb-session')(session);


// Last.fm API key
const API_KEY = 'd2dd9980c5eb43c560bb6bf70f72c386';
// Last.fm API endpoint
const LASTFM_API_URL = 'http://ws.audioscrobbler.com/2.0/';

const User = require('./models/user');
const PortfolioItem = require('./models/portfolioItem');

const app = express();

app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect("mongodb+srv://nazken_koblanova:nazken@final.j0pvgig.mongodb.net/");
const db = mongoose.connection;

db.on('error', () => console.log("Error in Connecting to Database"));
db.once('open', () => console.log("Connected to Database"));

const store = new MongoDBStore({
    uri: 'mongodb+srv://nazken_koblanova:nazken@final.j0pvgig.mongodb.net/',
    collection: 'sessions'
});

// Catch errors
store.on('error', function (error) {
    console.log(error);
});

app.use(session({
    secret: 'Nazken',
    resave: false,
    saveUninitialized: true,
    store: store
}));


app.get("/", (req, res) => {
    return res.render('registration');
});


// a GET route for the login page
app.get("/login", (req, res) => {
    res.render('login');
});


app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username }).exec();

        if (user) {
            const passwordMatch = await bcrypt.compare(password, user.password);

            if (passwordMatch) {
                console.log("Login Successful");
                req.session.user = user;
                req.session.userId = user.id;
                req.session.admin = user.role === "admin"; // Check if user is an admin
                return res.redirect(`/main_page/${user._id}`);
            } else {
                console.log("Invalid Password");
                return res.status(401).send("Invalid login credentials");
            }
        } else {
            console.log("User not found");
            return res.status(401).send("Invalid login credentials");
        }
    } catch (err) {
        console.error(err);
        return res.status(500).send("Internal Server Error");
    }
});

const authMiddleware = (req, res, next) => {
    if (req.session && req.session.user) {
        req.user = req.session.user;
    }
    next();
};
app.use(authMiddleware);

app.route("/sign_up").post(async (req, res) => {
    const { username, email, firstName, lastName, age, country, gender, password } = req.body;

    try {
        // Check if password meets requirements
        if (password.length < 5) {
            return res.status(400).send("Password must be at least 5 characters long");
        }

        // Hash the password using bcrypt
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create a new user instance using the User model with the hashed password
        const newUser = new User({
            username,
            email,
            firstName,
            lastName,
            age,
            country,
            gender,
            password: hashedPassword // Store the hashed password in the database
        });

        // Save the new user to the database
        await newUser.save();
        console.log("Record Inserted Successfully");

        // welcome email to the user
        sendWelcomeEmail(email);

        // Redirect to login page after successful signup
        return res.redirect('/login');
    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
    }
});


app.get("/main_page/:userId", async (req, res) => {
    const userId = req.params.userId;
    try {
        // Fetch non-deleted portfolio items from the database
        const portfolioItems = await PortfolioItem.find({ deletedAt: null });

       
        return res.render('main_page', { userId: userId, portfolioItem: portfolioItems });
    } catch (err) {
        console.error(err);
        return res.status(500).send("Internal Server Error");
    }
});


app.get('/admin', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.redirect('/login'); 
        }

        if (!req.session.admin) {
            return res.redirect(`/main_page/${req.session.userId}`); // Redirect regular users to main page
        }

        const user = await User.findById(req.session.userId);

        if (!user || user.role !== 'admin') {
            return res.redirect(`/main_page/${req.session.userId}`);
        }
        // Fetch non-deleted portfolio items from the database
        const portfolioItems = await PortfolioItem.find({ deletedAt: null });

       
        return res.render('admin', { userId: req.session.userId, user: user, portfolioItems: portfolioItems });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Something went wrong' });
    }
});







// nodemailer

const transporter = nodemailer.createTransport({
    service: 'Mail.ru',
    auth: {
        user: 'ms.nazken@mail.ru',
        pass: 'nDVMBReEi7YLDDy4pxMd'
    }
});

// Function to send welcome email
const sendWelcomeEmail = (email) => {
    // Define email content
    const mailOptions = {
        from: 'ms.nazken@mail.ru',
        to: email,
        subject: 'Welcome to my portfolio website that is dedicated to the BTS!',
        html: '<h1>I hope you will enjoy my portfolio.</h1><p>Thank you!</p>'
    };

    // Send the email
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending welcome email:', error);
        } else {
            console.log('Welcome email sent:', info.response);
        }
    });
};







// route to handle form submission for adding a new portfolio item
app.post('/add_item', async (req, res) => {
    try {
        // Extract portfolio item details from the request body
        const { titleEng, titleKaz, descEng, descKaz, imageUrl1, imageUrl2, imageUrl3 } = req.body;

      
        const newItem = new PortfolioItem({
            nameEng: titleEng,
            nameKaz: titleKaz,
            descriptionEng: descEng,
            descriptionKaz: descKaz,
            images: [imageUrl1, imageUrl2, imageUrl3]
        });

        // Save the new item to the database
        await newItem.save();

     
        res.redirect('/admin');
    } catch (error) {
        console.error('Error adding portfolio item:', error);
        res.status(500).send('Internal Server Error');
    }
});

// route to render the edit item page
app.get('/edit_item/:id', async (req, res) => {
    try {
        // Fetch the portfolio item by its ID
        const itemId = req.params.id;
        const item = await PortfolioItem.findById(itemId);

        
        res.render('edit_item', { item: item, userId: req.session.userId });
    } catch (error) {
        console.error('Error fetching item for editing:', error);
        res.status(500).send('Internal Server Error');
    }
});

// route to handle form submission for editing a portfolio item
app.post('/edit_item/:id', async (req, res) => {
    try {
        // Extract updated portfolio item details from the request body
        const { titleEng, titleKaz, descEng, descKaz, imageUrl1, imageUrl2, imageUrl3 } = req.body;

        // Find the portfolio item by its ID and update its details
        const itemId = req.params.id;
        const updatedItem = await PortfolioItem.findByIdAndUpdate(itemId, {
            nameEng: titleEng,
            nameKaz: titleKaz,
            descriptionEng: descEng,
            descriptionKaz: descKaz,
            images: [imageUrl1, imageUrl2, imageUrl3]
        }, { new: true }); 

        // Check if the item was successfully updated
        if (!updatedItem) {
            console.error('Portfolio item not found');
            return res.status(404).send('Portfolio item not found');
        }

     
        res.redirect('/admin');
    } catch (error) {
        console.error('Error updating portfolio item:', error);
        res.status(500).send('Internal Server Error');
    }
});


// route to handle deleting a portfolio item
app.get('/delete_item/:id', async (req, res) => {
    try {
        // Find the portfolio item by its ID and update deletedAt timestamp
        const itemId = req.params.id;
        await PortfolioItem.findByIdAndUpdate(itemId, { deletedAt: new Date() });

        res.redirect('/admin');
    } catch (error) {
        console.error('Error deleting portfolio item:', error);
        res.status(500).send('Internal Server Error');
    }
});















///// api 1



app.get('/btsTopTracks', async (req, res) => {
    try {
        // Make request to Last.fm API
        const response = await axios.get(LASTFM_API_URL, {
            params: {
                method: 'artist.getTopTracks',
                artist: 'BTS',
                api_key: API_KEY,
                format: 'json',
                limit: 10 
            }
        });

        // Extract track names and playcounts from response
        const tracks = response.data.toptracks.track.map(track => ({
            name: track.name,
            playcount: parseInt(track.playcount)
        }));

    
        const trackNames = tracks.map(track => track.name);
        const playcounts = tracks.map(track => track.playcount);

        // Render the chart using Chart.js and pass trackNames, playcounts, and userId
        res.render('api1', { data: { trackNames, playcounts }, userId: req.session.userId });

    } catch (error) {
        console.error('Error fetching BTS top tracks:', error.message);
        res.status(500).send('Internal Server Error');
    }
});


app.use(express.static('public'));




////// api 2 and 3



app.get('/api2', async (req, res) => {

    res.render('api2', {userId: req.session.userId});
});

app.get('/api3', async (req, res) => {

    res.render('api3', {userId: req.session.userId});
});







// route to handle sending contact info via email
app.get('/contact_info', async (req, res) => {
    try {
        sendContactInfoEmail(req.session.user.email);
        res.status(200).send('Contact info sent successfully');
    } catch (error) {
        console.error('Error sending contact info email:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Function to send contact information email
const sendContactInfoEmail = (recipientEmail) => {
    const mailOptions = {
        from: 'ms.nazken@mail.ru',
        to: recipientEmail,
        subject: 'Contact Information',
        html: '<h1>Contact Information</h1><p>Please feel free to contact me via email at ms.nazken@mail.ru for any inquiries.</p>'
    };
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending contact info email:', error);
        } else {
            console.log('Contact info email sent:', info.response);
        }
    });
};







app.listen(8090, () => {
    console.log("Listening on PORT 8090");
});
