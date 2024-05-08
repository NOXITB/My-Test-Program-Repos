use futures_util::future::join_all;
use lapin::{
    options::{QueueDeclareOptions, QueueDeleteOptions, BasicAckOptions},
    types::FieldTable,
    Channel, Connection, ConnectionProperties,
};
use mongodb::{options::ClientOptions, Client};
use quick_xml::de::from_str;
use reqwest::Client as HttpClient;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::time::Duration;
use tokio::time::sleep;

#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        eprintln!("Error: {}", e);
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    // Setup connections
    let mongo_url = "mongodb://admin:adminPassword@localhost:27017";
    let mongo_client = Client::with_options(ClientOptions::parse(mongo_url).await?)?;
    let db = mongo_client.database("mydatabase");

    let amqp_url = "amqp://10.1.0.76";
    let conn = Connection::connect(amqp_url, ConnectionProperties::default()).await?;
    let channel = conn.create_channel().await?;

    // Declare queues
    let queue = channel
        .queue_declare("urls", QueueDeclareOptions::default(), FieldTable::default())
        .await?;
    let stats_queue = channel
        .queue_declare("stats", QueueDeclareOptions::default(), FieldTable::default())
        .await?;

    // Placeholder for actual crawler implementation
    crawl("http://example.com", &channel, &db).await?;

    Ok(())
}

async fn crawl(url: &str, channel: &Channel, db: &mongodb::Database) -> Result<(), Box<dyn std::error::Error>> {
    let http_client = HttpClient::new();
    let response = fetch_with_retry(&http_client, url, 3).await?;
    let html = response.text().await?;

    let document = Html::parse_document(&html);
    let selector = Selector::parse("a[href]").unwrap();
    let found_urls = document
        .select(&selector)
        .filter_map(|x| x.value().attr("href"))
        .collect::<Vec<_>>();

    // Database and channel operations would occur here

    Ok(())
}

async fn fetch_with_retry(client: &HttpClient, url: &str, max_retries: usize) -> Result<reqwest::Response, reqwest::Error> {
    let mut retries = 0;
    loop {
        match client.get(url).send().await {
            Ok(response) => return Ok(response),
            Err(err) if retries < max_retries => {
                retries += 1;
                sleep(Duration::from_secs(2_u64.pow(retries as u32))).await;
            },
            Err(err) => return Err(err),
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
struct SiteMap {
    urlset: UrlSet,
}

#[derive(Debug, Deserialize, Serialize)]
struct UrlSet {
    url: Vec<UrlEntry>,
}

#[derive(Debug, Deserialize, Serialize)]
struct UrlEntry {
    loc: String,
}

async fn parse_sitemap(xml: &str) -> Result<Vec<String>, serde_xml_rs::Error> {
    let sitemap: SiteMap = from_str(xml)?;
    Ok(sitemap.urlset.url.into_iter().map(|x| x.loc).collect())
}