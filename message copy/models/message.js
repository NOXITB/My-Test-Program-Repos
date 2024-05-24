// models/message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    content: String,
    timestamp: { type: Date, default: Date.now },
    username: String // Add username field to store the username of the user who sent the message
});

module.exports = mongoose.model('Message', messageSchema);
