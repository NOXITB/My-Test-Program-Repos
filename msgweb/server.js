// server.js
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const amqp = require('amqplib');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Sample message history for demonstration
let messageHistory = [];

// Express session middleware
app.use(session({
    secret: 'secret', // Change this to a more secure secret in production
    resave: true,
    saveUninitialized: true
}));

app.use(bodyParser.json());
app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

function generateRandomName(req) {
    if (!req.session.username) {
        const names = ['Alice', 'Bob', 'Charlie', 'David', 'Emma', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack'];
        req.session.username = names[Math.floor(Math.random() * names.length)];
    }
    return req.session.username;
}

app.post('/send', async (req, res) => {
    const { content } = req.body;
    const senderName = generateRandomName(req); // Function to generate random names

    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();

    const queueName = 'messages';

    await channel.assertQueue(queueName, { durable: false });

    const message = { 
        content,
        sender: senderName, 
        timestamp: new Date() 
    };

    channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)));
    console.log("Message sent:", message);

    messageHistory.push(message); // Store message in history
    io.emit('message', message); // Broadcast the message to all connected clients

    res.status(200).send("Message sent successfully!");
});

app.get('/history', (req, res) => {
    res.json(messageHistory); // Return message history
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
