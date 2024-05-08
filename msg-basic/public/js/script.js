// public/js/script.js

document.addEventListener('DOMContentLoaded', () => {
    const messageForm = document.getElementById('messageForm');
    const messageInput = document.getElementById('messageInput');
    const chatMessages = document.getElementById('chatMessages');
    const roomName = '<%= roomName %>'; // Get room name from EJS template

    // Function to append message to chat
    function appendMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.innerText = message;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // WebSocket or HTTP request to get messages and send messages
    // Example with Fetch API
    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = messageInput.value.trim();
        if (message !== '') {
            fetch('/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ roomName, message })
            })
            .then(response => {
                if (response.ok) {
                    appendMessage(message);
                    messageInput.value = '';
                } else {
                    console.error('Failed to send message:', response.statusText);
                }
            })
            .catch(error => {
                console.error('Error sending message:', error);
            });
        }
    });
});
