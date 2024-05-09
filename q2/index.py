import pika
import pymongo
from bs4 import BeautifulSoup
from pyppeteer import launch
import asyncio

# Connect to RabbitMQ
connection = pika.BlockingConnection(pika.ConnectionParameters('10.1.0.76'))
channel = connection.channel()

# Connect to MongoDB
client = pymongo.MongoClient("mongodb://10.1.0.76:27017/")
db = client["website_crawler"]
collection = db["pages"]

async def crawl(url):
    browser = await launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])
    page = await browser.newPage()
    await page.goto(url)
    content = await page.content()
    await browser.close()
    return content

def callback(ch, method, properties, body):
    url = body.decode()
    print("Processing URL:", url)
    asyncio.create_task(process_url(url))
    ch.basic_ack(delivery_tag=method.delivery_tag)

async def process_url(url):
    print("Crawling:", url)

    # Load the webpage with JavaScript using pyppeteer
    content = await crawl(url)

    # Parse the webpage
    soup = BeautifulSoup(content, 'html.parser')

    # Store content in MongoDB
    collection.insert_one({"url": url, "content": content})

    # Extract links
    links = [link.get('href') for link in soup.find_all('a')]
    
    if links:
        print("Found URLs:")
        for link in links:
            print("-", link)
            channel.basic_publish(exchange='', routing_key='urls1', body=link)
    else:
        print("No URLs found on this page.")

async def consume_urls():
    # Consume URLs from RabbitMQ
    channel.queue_declare(queue='urls1', durable=True)
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue='urls1', on_message_callback=callback)

    print("Waiting for URLs...")
    await channel.start_consuming()

async def main():
    await asyncio.gather(consume_urls())

if __name__ == "__main__":
    asyncio.run(main())
