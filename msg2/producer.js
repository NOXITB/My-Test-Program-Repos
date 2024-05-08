// producer.js
const amqp = require('amqplib');
require('dotenv').config();

async function main() {
    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();

    const queueName = 'messages';

    await channel.assertQueue(queueName, { durable: false });

    const message = { 
        content: 'Hello, RabbitMQ!', 
        timestamp: new Date() 
    };

    channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)));
    console.log("Message sent:", message);

    setTimeout(() => {
        connection.close();
    }, 500);
}

main().catch(console.error);
