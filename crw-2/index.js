const amqp = require('amqplib');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const { URL } = require('url');

// RabbitMQ connection URL
const rabbitUrl = 'amqp://10.1.0.76';

// Number of queues and consumers
const numQueues = 4;
const numConsumersPerQueue = 2;

// Define queue names
const queueNames = Array.from({ length: numQueues }, (_, i) => `urls_${i}`);

// Directory to store JSON files
const dataDirectory = './data';

// Ensure the data directory exists
if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory);
}

// Function to start the crawler
async function startCrawler() {
    // Connect to RabbitMQ
    const connection = await amqp.connect(rabbitUrl);
    const channel = await connection.createChannel();

    // Assert queues
    await Promise.all(queueNames.map(queueName => channel.assertQueue(queueName)));

    // Start consumers for each queue
    for (let i = 0; i < numQueues; i++) {
        for (let j = 0; j < numConsumersPerQueue; j++) {
            consumeFromQueue(channel, queueNames[i]);
        }
    }

    console.log('Crawler started...');
}

// Function to consume messages from a queue
function consumeFromQueue(channel, queueName) {
    channel.consume(queueName, async (msg) => {
        const url = msg.content.toString();
        console.log(`Fetching URL: ${url}`);

        try {
            // Fetch the HTML content of the URL
            const response = await axios.get(url);
            const html = response.data;

            // Parse the HTML using Cheerio
            const $ = cheerio.load(html);

            // Extract links from the page
            const links = [];
            $('a').each((index, element) => {
                const link = $(element).attr('href');
                if (link) {
                    const absoluteUrl = new URL(link, url).href;
                    links.push(absoluteUrl);
                }
            });

            // Print the links found
            console.log(`Found ${links.length} links:`);
            console.log(links);

            // Store the links in a JSON file
            const baseDomain = new URL(url).hostname.replace('www.', '');
            const fileName = `${baseDomain.replace(/\./g, '_')}.json`;
            const filePath = `${dataDirectory}/${fileName}`;
            fs.writeFileSync(filePath, JSON.stringify(links, null, 2));

            // Send the links to the queues for further processing
            const nextQueueIndex = (queueNames.indexOf(queueName) + 1) % numQueues;
            const nextQueueName = queueNames[nextQueueIndex];
            links.forEach((link) => {
                channel.sendToQueue(nextQueueName, Buffer.from(link));
            });
        } catch (error) {
            console.error(`Error fetching URL ${url}: ${error.message}`);
        } finally {
            // Acknowledge the message
            channel.ack(msg);
        }
    });
}

// Start the crawler
startCrawler().catch(console.error);
