import pika

# Connect to RabbitMQ
connection = pika.BlockingConnection(pika.ConnectionParameters('10.1.0.76'))
channel = connection.channel()

def send_initial_url(url):
    # Declare the queue
    channel.queue_declare(queue='urls1', durable=True)

    # Send the initial URL to the queue
    channel.basic_publish(exchange='', routing_key='urls', body=url)

    print("Initial URL sent:", url)

# Replace 'initial_url' with the URL you want to send as the initial URL
initial_url = "https://example.com"
send_initial_url(initial_url)

# Close the connection
connection.close()
