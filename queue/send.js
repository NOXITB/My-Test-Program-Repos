const amqp = require('amqplib');

async function main() {
  const connection = await amqp.connect('amqp://10.1.0.76:5672'); // Use your RabbitMQ server IP
  const channel = await connection.createChannel();
  const queue = 'urls';

  await channel.assertQueue(queue);

  // Example URLs to crawl
  const urls = ['http://example.com', 'http://example.org', 'http://example.net', 'https://youtube.com', 'https://amazon.com', 'https://google.com'];

  urls.forEach(url => {
    channel.sendToQueue(queue, Buffer.from(url));
    console.log(`[x] Sent ${url}`);
  });

  setTimeout(() => {
    connection.close();
    process.exit(0);
  }, 500);
}

main().catch(console.error);
