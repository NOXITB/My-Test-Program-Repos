const { MongoClient } = require('mongodb');

async function main() {
  const mongoUrl = 'mongodb://admin:adminPassword@10.1.0.76:27017/';
  const mongoClient = new MongoClient(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  const db = mongoClient.db();

  const unpCrawlCollection = db.collection('unp_crawl');
  const crawledDataCollection = db.collection('crawledData');

  // Find all documents in the unp_crawl collection
  const unpCrawlDocuments = await unpCrawlCollection.find({}).toArray();

  // Process each document and organize URLs by domains and subdomains
  for (const document of unpCrawlDocuments) {
    const url = document.url;
    const hostnameParts = new URL(url).hostname.split('.'); // Split hostname into parts
    let baseDomain = '';
    let subdomain = '';

    // Logic to determine baseDomain and subdomain

    // Update or insert the document in the crawledData collection
    await crawledDataCollection.updateOne(
      { domain: baseDomain },
      { $addToSet: { [`subdomains.${subdomain || 'base'}`]: url } },
      { upsert: true }
    );
  }

  console.log('Processing complete.');

  // Close the MongoDB connection
  await mongoClient.close();
}

main().catch(console.error);
