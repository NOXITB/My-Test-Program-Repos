const amqp = require('amqplib');
const { MongoClient } = require('mongodb');

async function clearQueue(queueName) {
  const connection = await amqp.connect('amqp://10.1.0.76'); // Use your RabbitMQ server IP
  const channel = await connection.createChannel();

  await channel.assertQueue(queueName);
  await channel.purgeQueue(queueName);
  console.log(`Queue ${queueName} cleared.`);

  await channel.close();
  await connection.close();

  // Clear MongoDB collection
  const mongoUrl = 'mongodb://admin:adminPassword@10.1.0.76:27017/'; // MongoDB connection URL
  const mongoClient = new MongoClient(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  const db = mongoClient.db();
  const collection = db.collection('crawledData');
  await collection.deleteMany({});
  console.log(`MongoDB collection for ${queueName} cleared.`);

  await mongoClient.close();
}

clearQueue('urls').catch(console.error);
