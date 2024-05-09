const amqp = require('amqplib');

async function main() {
  const connection = await amqp.connect('amqp://10.1.0.76:5672'); // Use your RabbitMQ server IP
  const channel = await connection.createChannel();
  const queue = 'urls';

  await channel.assertQueue(queue);

  // Example URLs to crawl
  const urls = [ 'google.com', ]; // Just one URL for demonstration purposes

  // Send each URL 10 times
  for (let i = 0; i < urls.length; i++) {
    for (let j = 0; j < 1000; j++) {
      channel.sendToQueue(queue, Buffer.from(urls[i]));
      console.log(`[x] Sent ${urls[i]}`);
    }
  }

  setTimeout(() => {
    connection.close();
    process.exit(0);
  }, 500);
}

main().catch(console.error);
