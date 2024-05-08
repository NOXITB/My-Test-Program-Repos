// consumer.js
const amqp = require('amqplib');
require('dotenv').config();

async function main() {
    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();

    const queueName = 'messages';

    await channel.assertQueue(queueName, { durable: false });

    console.log("Waiting for messages...");

    channel.consume(queueName, (msg) => {
        const message = JSON.parse(msg.content.toString());
        console.log("Received message:", message);
    }, { noAck: true });
}

main().catch(console.error);
