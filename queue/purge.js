const amqp = require('amqplib');
const { MongoClient } = require('mongodb');

async function clearQueue(queueNames) {
  const connection = await amqp.connect('amqp://10.1.0.76'); // Use your RabbitMQ server IP
  const channel = await connection.createChannel();

  for (const queueName of queueNames) {
    await channel.assertQueue(queueName);
    await channel.purgeQueue(queueName);
    console.log(`Queue ${queueName} cleared.`);
  }

  await channel.close();
  await connection.close();

  // Clear MongoDB collection
  const mongoUrl = 'mongodb://admin:adminPassword@10.1.0.76:27017/'; // MongoDB connection URL
  const mongoClient = new MongoClient(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  const db = mongoClient.db();
  const collection = db.collection('crawledData');
  await collection.deleteMany({});
  console.log(`MongoDB collection for ${queueNames.join(', ')} cleared.`);

  await mongoClient.close();
}

clearQueue(['urls_0', 'urls_1', 'urls_2', 'urls_3']).catch(console.error);
