const puppeteer = require('puppeteer');
const readlineSync = require('readline-sync');

async function openBrowserAndLoadPage() {
  const browser = await puppeteer.launch({ headless: false }); // Launch browser in non-headless mode for debugging
  const page = await browser.newPage();
  await page.goto('https://tw1nk.social/');
  return { browser, page };
}

async function waitForInput() {
  readlineSync.question('Press Enter when you are ready to start filling out the form...');
}

async function fillAndSubmitForm(page) {
  try {
    // Wait for the form to appear
    await page.waitForSelector('#quoteForm');

    // Generate a random name
    const name = generateRandomName();

    // Fill out the form
    await page.type('#name', name);
    await page.type('#quote', generateRandomText());

    // Submit the form
    await page.click('button[type="submit"]');

    console.log('Form submitted successfully!');
  } catch (error) {
    console.error('Error submitting form:', error);
  }
}

// Function to generate a random name
function generateRandomName() {
  const firstName = ['John', 'Jane', 'Alice', 'Bob', 'Emily', 'Michael', 'Sophia', 'Daniel'];
  const lastName = ['Smith', 'Johnson', 'Williams', 'Jones', 'Brown', 'Davis', 'Miller', 'Wilson'];
  const randomFirstName = firstName[Math.floor(Math.random() * firstName.length)];
  const randomLastName = lastName[Math.floor(Math.random() * lastName.length)];
  return `${randomFirstName} ${randomLastName}`;
}

// Function to generate random text with at least 600 characters
function generateRandomText() {
  let text = '';
  const alphabet = 'abcdefghijklmnopqrstuvwxyz ';
  for (let i = 0; i < 600; i++) {
    text += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return text;
}

async function main() {
  const { browser, page } = await openBrowserAndLoadPage();
  await waitForInput();
  await fillAndSubmitForm(page);

}

// Call the main function
main();
