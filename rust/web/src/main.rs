use std::{
    collections::HashSet,
    time::{Duration, Instant},
};

use lapin::{
    options::*, types::FieldTable, BasicProperties, Connection, ConnectionProperties, Consumer,
    ConsumerDelegate,
};
use mongodb::{bson::doc, Client};
use reqwest;
use serde::Deserialize;
use tokio::time;

const MAX_RETRIES: usize = 3;
const CRAWL_DELAY_MS: u64 = 1000;

#[derive(Debug, Deserialize)]
struct UrlSet {
    url: Vec<Url>,
}

#[derive(Debug, Deserialize)]
struct Url {
    loc: Vec<String>,
}

async fn fetch_with_retry(url: &str, max_retries: usize) -> Result<reqwest::Response, reqwest::Error> {
    for retries in 0..max_retries {
        match reqwest::get(url).await {
            Ok(response) => return Ok(response),
            Err(error) => {
                println!("HTTP request failed: {}", error);
                println!("Retrying ({}/{})", retries + 1, max_retries);
                time::sleep(Duration::from_millis(1000 * 2_u64.pow(retries as u32))).await;
            }
        }
    }
    Err(reqwest::Error::from(reqwest::StatusCode::INTERNAL_SERVER_ERROR))
}

async fn parse_sitemap(url: &str) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let response = fetch_with_retry(url, MAX_RETRIES).await?;
    let xml = response.text().await?;
    let url_set: UrlSet = quick_xml::de::from_str(&xml)?;
    let urls: Vec<String> = url_set.url.iter().flat_map(|u| u.loc.clone()).collect();
    Ok(urls)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Enable the `serialize` feature for `quick_xml`
    let _ = quick_xml::Builder::new().serialize().build();

    let amqp_connection = Connection::connect(
        "amqp://10.1.0.76",
        ConnectionProperties::default().with_tokio_executor(),
    )
    .await?;
    let channel = amqp_connection.create_channel().await?;
    let queue = channel
        .queue_declare("urls", QueueDeclareOptions::default(), FieldTable::default())
        .await?;
    let stats_queue = channel
        .queue_declare("stats", QueueDeclareOptions::default(), FieldTable::default())
        .await?;

    println!(
        " [*] Waiting for messages in {}. To exit press CTRL+C",
        queue.name().as_str()
    );

    // Initialize visited_urls HashSet
    let visited_urls = HashSet::new();

    // Define consumer handler
    struct ConsumerHandler;

    #[async_trait::async_trait]
    impl ConsumerDelegate for ConsumerHandler {
        async fn handle_delivery(
            &self,
            _channel: lapin::Channel,
            delivery: lapin::message::Delivery,
        ) {
            if let Ok(Some(body)) = delivery.data.as_ref() {
                let url = String::from_utf8_lossy(body).to_string();
                println!("[x] Received {}", url);

                // Your processing logic here

                // Acknowledge message after processing
                if let Err(err) = delivery
                    .ack(BasicAckOptions::default())
                    .await
                {
                    eprintln!("Error acknowledging message: {:?}", err);
                }
            }
        }

        async fn on_new_delivery(
            &self,
            delivery: Result<std::option::Option<Delivery>, lapin::Error>,
        ) -> Pin<Box<(dyn Future<Output = ()> + Send + 'static)>> {
            // Implement your message processing logic here based on the delivery result
            todo!()  // Replace with your actual processing logic
        }
    }

    let consumer = channel
    .basic_consume(
        "urls",
        "consumer-1",
        BasicConsumeOptions::default(),
        FieldTable::default(), // Closing parenthesis added here
    )
    .await?;