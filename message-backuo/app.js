const express = require('express');
const mongoose = require('mongoose');
const amqp = require('amqplib');
const WebSocket = require('ws');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

// Define message schema
const messageSchema = new mongoose.Schema({
    content: String,
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

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

// Serve static files
app.use(express.static('public'));

// Send message route
app.post('/send', async (req, res) => {
    const { content } = req.body;
    const message = new Message({ content });
    await message.save();

    const channel = await connectRabbitMQAndPublish();
    channel.publish('messages_exchange', '', Buffer.from(JSON.stringify(message)));

    res.redirect('/');
});

// Display messages route
app.get('/messages', async (req, res) => {
    const messages = await Message.find().sort({ timestamp: -1 });
    res.json(messages);
});

// Display index page
app.get('/', async (req, res) => {
    const messages = await Message.find().sort({ timestamp: -1 });
    res.render('index', { messages });
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
