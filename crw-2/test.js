const amqp = require('amqplib');
const fs = require('fs');

// RabbitMQ connection URL
const rabbitUrl = 'amqp://10.1.0.76';

// Define the queue names to send URLs to
const queueNames = ['urls_0', 'urls_1', 'urls_2', 'urls_3', 'urls_4', 'urls_5', 'urls_6', 'urls_7', 'urls_8', 'urls_9', 'urls_10', 'urls_11'];

// Read websites from websites.json
fs.readFile('websites.json', 'utf8', async (err, data) => {
    if (err) {
        console.error('Error reading websites.json:', err);
        return;
    }

    try {
        const websites = JSON.parse(data);

        // Function to send a URL to the queue
        async function sendUrl(url, queueName) {
            // Connect to RabbitMQ
            const connection = await amqp.connect(rabbitUrl);
            const channel = await connection.createChannel();

            // Assert the queue
            await channel.assertQueue(queueName);

            // Send the URL to the queue
            channel.sendToQueue(queueName, Buffer.from(url));

            console.log(`URL "${url}" sent to queue "${queueName}"`);

            // Close the connection
            await channel.close();
            await connection.close();
        }

        // Send URLs to the queues
        async function sendUrls() {
            let queueIndex = 0;
            for (const website of websites) {
                await sendUrl(website, queueNames[queueIndex]);
                queueIndex = (queueIndex + 1) % queueNames.length;
            }
        }

        // Send the URLs
        sendUrls().catch(console.error);
    } catch (error) {
        console.error('Error parsing JSON:', error);
    }
});
