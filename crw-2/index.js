const express = require('express');
const amqp = require('amqplib');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const { URL } = require('url');

const app = express();
const port = 3000;

// RabbitMQ connection URL
const rabbitUrl = 'amqp://10.1.0.76';

// Number of queues and consumers
const numQueues = 12;
const numConsumersPerQueue = 3;

// Define queue names
const queueNames = Array.from({ length: numQueues }, (_, i) => `urls_${i}`);

// Directory to store JSON files
const dataDirectory = './data';
const supportedDirectory = './data/spt'; // Directory for supported URLs
const unsupportedDirectory = './data/uspt'; // Directory for unsupported URLs
const baseDomainsFile = './data/base_domains.json'; // File to store base domains

// Ensure the data directories exist
if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory);
}
if (!fs.existsSync(supportedDirectory)) {
    fs.mkdirSync(supportedDirectory);
}
if (!fs.existsSync(unsupportedDirectory)) {
    fs.mkdirSync(unsupportedDirectory);
}

// Set to store base domains without duplicates
const baseDomainsSet = new Set();

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

        try {
            // Fetch the HTML content of the URL with automatic redirection following
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
                    // Add base domain to the set
                    const baseDomain = new URL(absoluteUrl).hostname.replace('www.', '');
                    baseDomainsSet.add(baseDomain);
                }
            });

            // Store the links in the appropriate JSON file and directory (append if file exists)
            const baseDomain = new URL(url).hostname.replace('www.', '');
            const fileName = `${baseDomain.replace(/\./g, '_')}.json`;
            const filePath = `${supportedDirectory}/${fileName}`;
            if (links.length > 0) {
                if (fs.existsSync(filePath)) {
                    // File exists, append links
                    const existingLinks = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    const updatedLinks = [...existingLinks, ...links];
                    fs.writeFileSync(filePath, JSON.stringify(updatedLinks, null, 2));
                } else {
                    // File doesn't exist, create and write links
                    fs.writeFileSync(filePath, JSON.stringify(links, null, 2));
                }
            }

            // Send the links to the queues for further processing
            const nextQueueIndex = (queueNames.indexOf(queueName) + 1) % numQueues;
            const nextQueueName = queueNames[nextQueueIndex];
            links.forEach((link) => {
                channel.sendToQueue(nextQueueName, Buffer.from(link));
            });

            // Acknowledge the message after successful processing
            channel.ack(msg);

            // Write base domains to JSON file
            const baseDomainsArray = [...baseDomainsSet];
            fs.writeFileSync(baseDomainsFile, JSON.stringify(baseDomainsArray, null, 2));
        } catch (error) {
            console.error(`Error fetching URL ${url}: ${error.message}`);
            // Requeue the URL if there was an error
            channel.sendToQueue(queueName, msg.content);
            // Acknowledge the message even if there's an error
            channel.ack(msg);
        }
    });
}

// Start the crawler
startCrawler().catch(console.error);

// Set up Express route for stats page
app.get('/', (req, res) => {
    // Read supported data directory for JSON files
    const supportedFiles = fs.readdirSync(supportedDirectory);
    const supportedStats = supportedFiles.map(file => {
        const filePath = `${supportedDirectory}/${file}`;
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return {
            url: file.replace('.json', '').replace(/_/g, '.'),
            count: data.length
        };
    });

    // Render stats page
    const html = `
        <h1>Crawling Statistics</h1>
        <h2>Supported URLs</h2>
        <table>
            <tr>
                <th>URL</th>
                <th>Links Found</th>
            </tr>
            ${supportedStats.map(stat => `<tr><td>${stat.url}</td><td>${stat.count}</td></tr>`).join('')}
        </table>
    `;
    res.send(html);
});

// Start Express server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
