// Import required modules
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const amqp = require('amqplib');
const WebSocket = require('ws');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

// Import models
const User = require('./models/user'); // Import User model
const Message = require('./models/message'); // Import Message model

// Connect to RabbitMQ and publish messages
async function connectRabbitMQAndPublish() {
    const connection = await amqp.connect(process.env.RABBITMQ_URI);
    const channel = await connection.createChannel();
    const exchange = 'messages_exchange';
    await channel.assertExchange(exchange, 'fanout', { durable: false });

    return channel;
}

// Initialize Express app
const app = express();
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // Parse JSON request bodies

// Register route
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const user = new User({ username, password });
    await user.save();
    const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET);
    res.cookie('token', token, { httpOnly: true });
    res.redirect('/');
});

// Login route
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
        return res.status(401).send('Invalid username or password');
    }
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.status(401).send('Invalid username or password');
    }
    const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET);
    res.cookie('token', token, { httpOnly: true });
    res.redirect('/');
});

// Logout route
app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});

// Send message route
// Send message route
app.post('/send', isAuthenticated, async (req, res) => {
    try {
        const { content } = req.body; // Extract content from request body
        const token = req.cookies.token;
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const username = decoded.username;

        const message = new Message({ content, username });
        await message.save(); // Save message to database
        const channel = await connectRabbitMQAndPublish();
        channel.publish('messages_exchange', '', Buffer.from(JSON.stringify(message)));
        res.sendStatus(200); // Send success response
    } catch (err) {
        console.error('Error sending message:', err);
        res.status(500).send('Internal Server Error');
    }
});


// Display messages route
app.get('/messages', async (req, res) => {
    try {
        const messages = await Message.find().sort({ timestamp: -1 });
        res.json(messages);
    } catch (err) {
        res.status(500).send('Internal Server Error');
    }
});

// Display index page
app.get('/', async (req, res) => {
    try {
        const messages = await Message.find().sort({ timestamp: -1 });
        res.render('index', { messages });
    } catch (err) {
        res.status(500).send('Internal Server Error');
    }
});

// Display login/register page
app.get('/login-register', (req, res) => {
    res.render('login-register');
});

// Create HTTP server
const server = app.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${server.address().port}`);
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('WebSocket connected');

    // Send existing messages to the client
    Message.find().sort({ timestamp: -1 }).then(messages => {
        ws.send(JSON.stringify(messages));
    });

    // Listen for new messages from RabbitMQ and send them to the client
    connectRabbitMQAndPublish().then(channel => {
        channel.assertQueue('', { exclusive: true }).then(q => {
            channel.bindQueue(q.queue, 'messages_exchange', '');
            channel.consume(q.queue, (msg) => {
                ws.send(msg.content.toString());
            }, { noAck: true });
        });
    });

    // Handle WebSocket close event
    ws.on('close', () => {
        console.log('WebSocket disconnected');
    });
});

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    const token = req.cookies.token;
    if (!token) {
        // Respond with 401 status code if not authenticated
        return res.status(401).send('Unauthorized');
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).send('Unauthorized');
    }
}

