const amqp = require('amqplib');

async function clearQueue() {
  const connection = await amqp.connect('amqp://10.1.0.76'); // Change the URL if RabbitMQ is running on a different host
  const channel = await connection.createChannel();
  
  const queueName = 'urls'; // Replace 'your_queue_name' with the actual name of your queue
  
  await channel.assertQueue(queueName);
  
  const { messageCount } = await channel.checkQueue(queueName);
  console.log(`Queue has ${messageCount} messages`);

  // Consume and acknowledge messages in parallel
  const numConsumers = 100; // Adjust the number of consumers based on your system capacity
  const consumers = Array.from({ length: numConsumers }, () => consumeMessages(channel, queueName));

  await Promise.all(consumers);

  console.log('Queue cleared completely');

  await channel.close();
  await connection.close();
}

async function consumeMessages(channel, queueName) {
  while (true) {
    const message = await channel.get(queueName);
    if (!message) break;
    await channel.ack(message);
    console.log(`Message ${message.content.toString()} cleared`);
  }
}

clearQueue().catch(console.error);
