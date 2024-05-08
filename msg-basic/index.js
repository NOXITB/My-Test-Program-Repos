// app.js

const express = require('express');
const bodyParser = require('body-parser');
const amqp = require('amqplib/callback_api');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Load room data from JSON file
let rooms = {};

try {
    const roomsData = fs.readFileSync('rooms.json', 'utf8');
    if (roomsData.trim() !== '') {
        rooms = JSON.parse(roomsData);
    }
} catch (err) {
    console.error('Error reading rooms.json', err);
}
app.set('view engine', 'ejs');

// RabbitMQ connection
let channel;
amqp.connect('amqp://10.1.0.76', (err, connection) => {
    if (err) {
        console.error('Error connecting to RabbitMQ', err);
        return;
    }
    connection.createChannel((err, ch) => {
        if (err) {
            console.error('Error creating RabbitMQ channel', err);
            return;
        }
        channel = ch;
    });
});

app.get('/', (req, res) => {
    res.render('index.ejs');
});

// Routes
app.post('/create-room', (req, res) => {
    const { roomName, password } = req.body;
    // Check if the room already exists
    if (rooms[roomName]) {
        res.status(400).send('Room already exists');
    } else {
        // Create a new room
        rooms[roomName] = { password, messages: [] };
        saveRoomsToJSON();
        res.send('Room created successfully');
    }
});

// Modify the '/join-room' route handler in your app.js file

app.post('/join-room', (req, res) => {
    const { roomName, password } = req.body;
    if (rooms[roomName] && rooms[roomName].password === password) {
        res.redirect(`/room/${roomName}`);
    } else {
        res.status(401).send('Invalid room or password');
    }
});

app.post('/send-message', (req, res) => {
    const { roomName, message } = req.body;
    if (rooms[roomName]) {
        rooms[roomName].messages.push(message);
        saveRoomsToJSON();
        // Publish message to RabbitMQ for broadcasting
        channel.assertQueue(roomName);
        channel.sendToQueue(roomName, Buffer.from(message));
        res.send('Message sent successfully');
    } else {
        res.status(404).send('Room not found');
    }
});

app.get('/room/:roomName', (req, res) => {
    const { roomName } = req.params;
    const room = rooms[roomName];
    if (!room) {
        res.status(404).send('Room not found');
        return;
    }
    res.render('room', { roomName, messages: room.messages });
});

// Function to save room data to JSON file
function saveRoomsToJSON() {
    fs.writeFileSync('rooms.json', JSON.stringify(rooms), 'utf8');
}

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
