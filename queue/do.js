const amqp = require('amqplib');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const { URL } = require('url');
const { MongoClient } = require('mongodb');
const os = require('os');

const MEMORY_THRESHOLD_GB = 16; // Memory threshold in GB

async function fetchWithRetry(url, maxRetries = 3) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      const response = await axios.get(url);
      return response;
    } catch (error) {
      console.error(`HTTP request failed: ${error.message}`);
      retries++;
      console.log(`Retrying (${retries}/${maxRetries})...`);
    }
  }
  throw new Error('Max retries exceeded. HTTP request failed.');
}

async function main() {
  const connection = await amqp.connect('amqp://10.1.0.76');
  const channel = await connection.createChannel();
  const queue = 'urls';
  const statsQueue = 'stats';
  const mongoUrl = 'mongodb://admin:adminPassword@10.1.0.76:27017/';

  const mongoClient = new MongoClient(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  const db = mongoClient.db();

  await channel.assertQueue(queue);
  await channel.assertQueue(statsQueue);

  console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", queue);

  const totalMemoryGB = os.totalmem() / (1024 * 1024 * 1024); // Convert total memory to GB

  async function processMessage(msg) {
    try {
      const url = msg.content.toString();
      console.log(`[x] Received ${url}`);

      const response = await fetchWithRetry(url);
      console.log(`[x] Crawled ${url}, status: ${response.status}`);

      const dom = new JSDOM(response.data, { url });
      const links = Array.from(dom.window.document.querySelectorAll('a[href]')).map(link => {
        const href = link.href;
        return new URL(href, url).href;
      });

      const collection = db.collection('crawledData');
      const crawledData = {
        url,
        status: response.status,
        timestamp: new Date().toISOString(),
        foundUrls: links
      };

      // Check if memory usage exceeds the threshold
      if (totalMemoryGB < MEMORY_THRESHOLD_GB) {
        await collection.insertOne(crawledData);
      } else {
        // Store data on disk if memory usage exceeds the threshold
        const fileName = `crawledData_${Date.now()}.json`;
        const fs = require('fs');
        fs.writeFileSync(fileName, JSON.stringify(crawledData));
        console.log(`[x] Data stored on disk: ${fileName}`);
      }

      links.forEach(link => {
        channel.sendToQueue(queue, Buffer.from(link));
        console.log(`[x] Found link: ${link}`);
      });

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

  channel.consume(queue, processMessage, { noAck: false });

  channel.on('drain', () => {
    console.log('All messages processed');
  });
}

main().catch(console.error);
