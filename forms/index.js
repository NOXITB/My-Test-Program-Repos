const puppeteer = require('puppeteer');

async function fillAndSubmitForm(index) {
  const browser = await puppeteer.launch({ headless: false }); // Launch browser in non-headless mode for debugging
  const page = await browser.newPage();

  try {
    await page.goto('https://tw1nk.social/');

    // Wait for the form to appear
    await page.waitForSelector('#quoteForm');

    // Generate a random name
    const name = generateRandomName();

    // Fill out the form
    await page.type('#name', name);
    await page.type('#quote', generateRandomText());

    // Submit the form
    await page.click('button[type="submit"]');

    console.log(`Form ${index + 1} submitted successfully!`);
  } catch (error) {
    console.error(`Error submitting form ${index + 1}:`, error);
  } finally {
    // Close the browser
    await browser.close();
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

// Function to repeat form submission 1000 times
async function submitFormsMultipleTimes() {
  const numOfSubmissions = 1000;

  for (let i = 0; i < numOfSubmissions; i++) {
    console.log(`Submitting form ${i + 1}/${numOfSubmissions}`);
    await fillAndSubmitForm(i);
  }
}

// Call the function to fill and submit the form 1000 times
submitFormsMultipleTimes();
