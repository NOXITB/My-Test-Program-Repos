const amqp = require('amqplib');

// RabbitMQ connection URL
const rabbitUrl = 'amqp://10.1.0.76';

// Define the queue name to send URLs to
const queueName = 'urls_0'; // Change this to the desired queue

// URL to send
const urlToSend = 'https://google.com'; // Change this to the URL you want to send

// Function to send a URL to the queue
async function sendUrl() {
    // Connect to RabbitMQ
    const connection = await amqp.connect(rabbitUrl);
    const channel = await connection.createChannel();

    // Assert the queue
    await channel.assertQueue(queueName);

    // Send the URL to the queue
    channel.sendToQueue(queueName, Buffer.from(urlToSend));

    console.log(`URL "${urlToSend}" sent to queue "${queueName}"`);

    // Close the connection
    await channel.close();
    await connection.close();
}

// Send the URL
sendUrl().catch(console.error);
