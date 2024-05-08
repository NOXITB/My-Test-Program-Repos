const amqp = require('amqplib');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const { URL } = require('url');
const { MongoClient } = require('mongodb');
const os = require('os');
const fs = require('fs');
const { parseString } = require('xml2js');

const MEMORY_THRESHOLD_GB = 16; // Memory threshold in GB
const MAX_RETRIES = 3; // Maximum number of retries for HTTP requests
const CRAWL_DELAY_MS = 1000; // Delay between requests in milliseconds

async function fetchWithRetry(url, maxRetries = MAX_RETRIES) {
  for (let retries = 0; retries < maxRetries; retries++) {
    try {
      const response = await axios.get(url);
      return response;
    } catch (error) {
      console.error(`HTTP request failed: ${error.message}`);
      console.log(`Retrying (${retries + 1}/${maxRetries})...`);
      await sleep(1000 * Math.pow(2, retries)); // Exponential backoff
    }
  }
  throw new Error('Max retries exceeded. HTTP request failed.');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function parseSitemap(url) {
  const response = await fetchWithRetry(url);
  const xml = response.data;
  return new Promise((resolve, reject) => {
    parseString(xml, (err, result) => {
      if (err) {
        reject(err);
      } else {
        const urls = result.urlset.url.map(item => item.loc[0]);
        resolve(urls);
      }
    });
  });
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

  const visitedUrls = new Set(); // Set to store visited URLs

  async function processMessage(msg) {
    try {
      const url = msg.content.toString();
      
      // Check if URL has been visited before
      if (visitedUrls.has(url)) {
        console.log(`[x] URL already visited: ${url}`);
        return;
      }

      console.log(`[x] Received ${url}`);

      const response = await fetchWithRetry(url);
      console.log(`[x] Crawled ${url}, status: ${response.status}`);

      const dom = new JSDOM(response.data, { url });
      const links = Array.from(dom.window.document.querySelectorAll('a[href]')).map(link => {
        const href = link.href;
        return new URL(href, url).href;
      });

      // Extract URLs from sitemaps if available
      const sitemapUrls = await getSitemapUrls(response.data, url);
      if (sitemapUrls.length > 0) {
        links.push(...sitemapUrls);
      }

      // Update visited URLs set
      visitedUrls.add(url);

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

  async function getSitemapUrls(html, baseUrl) {
    const dom = new JSDOM(html);
    const sitemapTags = dom.window.document.querySelectorAll('sitemap, loc');
    const sitemapUrls = Array.from(sitemapTags).map(tag => tag.textContent.trim());
    const absoluteUrls = sitemapUrls.map(url => new URL(url, baseUrl).href);
    const uniqueUrls = Array.from(new Set(absoluteUrls)); // Remove duplicates
    const urls = [];
    for (const url of uniqueUrls) {
      try {
        const sitemapUrls = await parseSitemap(url);
        urls.push(...sitemapUrls);
      } catch (error) {
        console.error(`Failed to parse sitemap from ${url}: ${error.message}`);
      }
    }
    return urls;
  }

  // Load robots.txt and respect crawl delay if specified
  async function loadRobotsTxt(url) {
    const baseUrl = new URL(url).origin; // Extract the base URL
    try {
      const response = await fetchWithRetry(`${baseUrl}/robots.txt`);
      const lines = response.data.split('\n');
      const robotsTxt = {};
      let userAgent = '*';
      for (const line of lines) {
        if (line.startsWith('User-agent:')) {
          userAgent = line.split(': ')[1];
          robotsTxt[userAgent] = [];
        } else if (line.startsWith('Disallow:')) {
          robotsTxt[userAgent].push(line.split(': ')[1]);
        } else if (line.startsWith('Crawl-delay:')) {
          robotsTxt[userAgent] = parseInt(line.split(': ')[1]);
        }
      }
      return robotsTxt;
    } catch (error) {
      console.error(`Failed to load robots.txt: ${error.message}`);
      return {}; // Return empty object if robots.txt is not found or cannot be loaded
    }
  }
  

  // Check if a URL is allowed by robots.txt rules
  async function isUrlAllowed(url, robotsTxt) {
    const userAgent = '*';
    const disallowedPaths = robotsTxt[userAgent] || [];
    for (const path of disallowedPaths) {
      if (url.startsWith(path)) {
        return false; // URL is disallowed
      }
    }
    return true; // URL is allowed
  }

  // Wait for the specified crawl delay before processing the next URL
  async function respectCrawlDelay(url, robotsTxt) {
    const userAgent = '*';
    const crawlDelay = robotsTxt[userAgent];
    if (crawlDelay) {
      console.log(`[x] Waiting for crawl delay (${crawlDelay} seconds) before fetching ${url}`);
      await sleep(crawlDelay * 1000);
    }
  }

  async function processQueue() {
    while (true) {
      const msg = await channel.get(queue);
      if (!msg) {
        console.log('Queue is empty. Waiting for new messages...');
        await sleep(5000); // Wait for 5 seconds before checking the queue again
        continue;
      }
      const url = msg.content.toString();
      const robotsTxt = await loadRobotsTxt(url);
      const allowed = await isUrlAllowed(url, robotsTxt);
      if (!allowed) {
        console.log(`[x] URL ${url} is disallowed by robots.txt`);
        channel.ack(msg);
        continue;
      }
      await respectCrawlDelay(url, robotsTxt);
      await processMessage(msg);
    }
  }

  processQueue().catch(error => {
    console.error(`Error in processQueue: ${error.message}`);
    process.exit(1); // Exit the process if an error occurs
  });
}

main().catch(console.error);
