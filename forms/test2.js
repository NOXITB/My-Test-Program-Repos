
async function performFetchRequests() {
  const promises = [];

  // Repeat the process 1000 times
  for (let i = 0; i < 1000; i++) {
    // Create 10 concurrent fetch requests
    for (let j = 0; j < 10; j++) {
      const promise = fetchRequests();
      promises.push(promise);
    }

    // Wait for all 10 fetch requests to complete before continuing
    await Promise.all(promises);

    // Clear the promises array for the next iteration
    promises.length = 0;
  }
}

async function fetchRequests() {
  try {
    // Generate random data between 6000 to 8000 characters long
    const randomDataLength = Math.floor(Math.random() * (100000 - 6000 + 1)) + 100000;
    const randomData = generateRandomText(randomDataLength);

    // Generate a random name
    const randomName = generateRandomName();

    // Perform POST fetch request
    const postResponse = await fetch("https://messaging.logodzip18.workers.dev/kv", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ key: randomName, value: randomData })
    });

    console.log(`POST request completed for ${randomName}:`, postResponse.status);

    // Perform OPTIONS fetch request
    const optionsResponse = await fetch("https://messaging.logodzip18.workers.dev/kv", {
      method: "OPTIONS",
      headers: {
        "Accept": "*/*",
        "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
        "Referer": "https://tw1nk.social/",
        "Referrer-Policy": "strict-origin-when-cross-origin"
      }
    });

    console.log('OPTIONS request completed:', optionsResponse.status);
  } catch (error) {
    console.error('Error performing fetch requests:', error);
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

// Function to generate random text with given length
function generateRandomText(length) {
  let text = '';
  const alphabet = 'abcdefghijklmnopqrstuvwxyz ';
  for (let i = 0; i < length; i++) {
    text += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return text;
}

// Call the function to perform fetch requests
performFetchRequests();
