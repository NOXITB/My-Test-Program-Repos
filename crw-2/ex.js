const amqp = require('amqplib');

// RabbitMQ connection URL
const rabbitUrl = 'amqp://10.1.0.76';

// Queue names to export
const queueNames = ['urls_0', 'urls_1', 'urls_2', 'urls_3', 'urls_4', 'urls_5', 'urls_6', 'urls_7', 'urls_8', 'urls_9', 'urls_10', 'urls_11'];

// Function to export the current contents of a queue
async function exportQueue(queueName) {
    // Connect to RabbitMQ
    const connection = await amqp.connect(rabbitUrl);
    const channel = await connection.createChannel();

    try {
        // Assert the queue
        await channel.assertQueue(queueName);

        // Get messages from the queue
        const { messageCount } = await channel.checkQueue(queueName);
        console.log(`Total messages in queue "${queueName}": ${messageCount}`);

        for (let i = 0; i < messageCount; i++) {
            const message = await channel.get(queueName);
            if (message !== false) {
                console.log(`Message ${i + 1} in queue "${queueName}": ${message.content.toString()}`);
                // You can process or export the message content here as needed
            }
        }
    } catch (error) {
        console.error(`Error exporting queue "${queueName}":`, error);
    } finally {
        // Close the connection
        await channel.close();
        await connection.close();
    }
}

// Export the contents of each queue
async function exportAllQueues() {
    for (const queueName of queueNames) {
        await exportQueue(queueName);
    }
}

// Export all queues
exportAllQueues().catch(console.error);
