const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

const targetUrl = 'https://noxcodes.xyz/ads/';

async function getRandomExternalLink() {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.goto(targetUrl, { waitUntil: 'networkidle2' });

        const content = await page.content();
        const $ = cheerio.load(content);

        // Find all links with target="_blank" and filter out those containing "github"
        const externalLinks = $('a[target="_blank"]')
            .map((_, element) => $(element).attr('href'))
            .get()
            .filter(link => !link.includes('github'));

        // Choose a random external link
        const randomIndex = Math.floor(Math.random() * externalLinks.length);
        const randomLink = externalLinks[randomIndex];

        await browser.close();

        return randomLink;
    } catch (error) {
        console.error('An error occurred while fetching external links:', error);
        return null;
    }
}

async function browseWithoutProxies(sessionId) {
    console.log(`Session ${sessionId}: Starting...`);
    while (true) {
        const randomLink = await getRandomExternalLink();
        if (!randomLink) {
            console.log(`Session ${sessionId}: Failed to get a random external link. Retrying...`);
            continue;
        }

        console.log(`Session ${sessionId}: Navigating to random external link: ${randomLink}`);
        // Simulate clicking the link by just logging it
        console.log(`Session ${sessionId}: Clicked on link. Waiting for 5 seconds...`);

        // Wait for 5 seconds
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log(`Session ${sessionId}: Done. Continuing session.`);
    }
}

// Define the number of sessions
const numSessions = 5;

// Create multiple browsing sessions
for (let i = 0; i < numSessions; i++) {
    browseWithoutProxies(i + 1);
}
