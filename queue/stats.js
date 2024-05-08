const express = require('express');
const amqp = require('amqplib');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs'); // Set the view engine to EJS

// Route to fetch and display stats
// Route to fetch and display stats
app.get('/', async (req, res) => {
    try {
      const connection = await amqp.connect('amqp://10.1.0.76'); // Use your RabbitMQ server IP
      const channel = await connection.createChannel();
      const statsQueue = 'stats'; // Queue for stats
  
      await channel.assertQueue(statsQueue);
  
      // Consume messages from stats queue
      channel.consume(statsQueue, (msg) => {
        const stats = JSON.parse(msg.content.toString());
        console.log('Received stats:', stats); // Add logging here
        // Render the stats template with the stats data
        res.render('stats', { stats });
      }, { noAck: true }); // Do not require acknowledgement
  
    } catch (error) {
      console.error('Error:', error);
      res.status(500).send('Internal Server Error');
    }
  });
  

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
