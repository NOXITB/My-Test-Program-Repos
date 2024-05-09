const amqp = require('amqplib');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const { URL } = require('url');
const { MongoClient } = require('mongodb');
const os = require('os');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const MEMORY_THRESHOLD_GB = 64; // Memory threshold in GB
const DATA_FOLDER = 'storedData'; // Folder for storing data files
const UPLOAD_DELAY_MS = 1000; // Delay between each upload operation in milliseconds
const JS_RENDER_THRESHOLD = 10; // Example: If a page has more than 10 script tags, use Puppeteer

// Function to create the data folder if it doesn't exist
function ensureDataFolderExists() {
  if (!fs.existsSync(DATA_FOLDER)) {
    fs.mkdirSync(DATA_FOLDER);
    console.log(`Data folder '${DATA_FOLDER}' created.`);
  }
}

async function fetchPage(url, usePuppeteer = false) {
  if (usePuppeteer) {
    return fetchPageWithPuppeteer(url);
  } else {
    const response = await axios.get(url);
    return response.data;
  }
}

async function shouldUsePuppeteerThreshold(url) {
  // Determine if Puppeteer should be used based on certain threshold criteria
  const response = await axios.get(url);
  const dom = new JSDOM(response.data);
  const scriptTags = dom.window.document.querySelectorAll('script');
  const totalScriptTags = scriptTags.length;

  if (totalScriptTags > JS_RENDER_THRESHOLD) {
    return true;
  }

  return false;
}

async function fetchPageWithPuppeteer(url) {
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });
  const html = await page.content();
  await browser.close();
  return html;
}

async function main() {
  const connection = await amqp.connect('amqp://10.1.0.76');
  const channel = await connection.createChannel();
  const queue = 'urls2';
  const statsQueue = 'stats';
  const mongoUrl = 'mongodb://admin:adminPassword@10.1.0.76:27017/';

  const mongoClient = new MongoClient(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  const db = mongoClient.db();

  await channel.assertQueue(queue);
  await channel.assertQueue(statsQueue);

  console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", queue);

  const totalMemoryGB = os.totalmem() / (1024 * 1024 * 1024); // Convert total memory to GB

  ensureDataFolderExists();

  async function processMessage(msg, channel) {
    try {
      const url = msg.content.toString();
      console.log(`[x] Received ${url}`);

      let html = await fetchPage(url);
      let dom;

      // Check if Puppeteer should be used based on the threshold
      const shouldUsePuppeteer = await shouldUsePuppeteerThreshold(url);

      // If Puppeteer should be used, re-fetch the page
      if (shouldUsePuppeteer) {
        html = await fetchPage(url, true);
      }

      dom = new JSDOM(html, { url });
      const parsedUrl = new URL(url);
      const baseDomain = parsedUrl.hostname.split('.').slice(-2).join('.'); // Get base domain

      const collection = db.collection('crawledData');

      const links = Array.from(dom.window.document.querySelectorAll('a[href]')).map(link => {
        const href = link.href;
        return new URL(href, url).href;
      });

      // Insert found links into the database
      for (const link of links) {
        await collection.updateOne(
          { domain: baseDomain },
          { $addToSet: { urls: link } },
          { upsert: true }
        );
        console.log(`[x] Found link: ${link}`);
        channel.sendToQueue(queue, Buffer.from(link));
      }

      // Send stats to the stats queue
      const response = await axios.get(url);
      const stats = {
        url,
        status: response.status,
        timestamp: new Date().toISOString()
      };
      channel.sendToQueue(statsQueue, Buffer.from(JSON.stringify(stats)));
    } catch (error) {
      console.error(`[x] Error processing message: ${error.message}`);
    } finally {
      channel.ack(msg);
    }
  }

  channel.consume(queue, (msg) => processMessage(msg, channel), { noAck: false });

  // Timer to stagger the data upload from files to MongoDB
  setInterval(() => {
    const files = fs.readdirSync(DATA_FOLDER);
    files.forEach((file, index) => {
      setTimeout(() => {
        const filePath = path.join(DATA_FOLDER, file);
        fs.readFile(filePath, 'utf8', async (err, data) => {
          if (err) {
            console.error(`Error reading file ${filePath}: ${err}`);
            return;
          }

          try {
            const jsonData = JSON.parse(data);
            const collection = db.collection('crawledData');
            await collection.updateOne(
              { domain: jsonData.domain },
              { $addToSet: { urls: { $each: jsonData.urls } } },
              { upsert: true }
            );
            console.log(`Data pushed to MongoDB: ${JSON.stringify(jsonData)}`);
          } catch (error) {
            console.error(`Error parsing JSON data: ${error}`);
          }

          // Delete the file after pushing data to MongoDB
          fs.unlink(filePath, err => {
            if (err) {
              console.error(`Error deleting file ${filePath}: ${err}`);
              return;
            }
            console.log(`File deleted: ${filePath}`);
          });
        });
      }, index * UPLOAD_DELAY_MS);
    });
  }, 30000); // 30 seconds interval

  channel.on('drain', () => {
    console.log('All messages processed');
  });
}

main().catch(console.error);
