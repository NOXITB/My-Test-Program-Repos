const fs = require('fs');

// Read websites from test.json
fs.readFile('test.json', 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading test.json:', err);
        return;
    }

    try {
        const websites = JSON.parse(data);

        // Append "http://" to each website
        const websitesWithHTTP = websites.map(website => "http://" + website);

        // Write the modified array to a JSON file
        fs.writeFile('websites.json', JSON.stringify(websitesWithHTTP, null, 2), err => {
            if (err) {
                console.error('Error writing JSON file:', err);
            } else {
                console.log('JSON file saved successfully!');
            }
        });
    } catch (error) {
        console.error('Error parsing JSON:', error);
    }
});
