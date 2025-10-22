// frontend/app.js

const authButton = document.getElementById('authButton');
const micButton = document.getElementById('micButton');
const statusDiv = document.getElementById('status');
const responseDiv = document.getElementById('response');

let isAuth = false;

// --- Utility Functions ---

function updateStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.style.color = isError ? '#e74c3c' : '#3498db';
}

function updateResponse(message) {
    responseDiv.innerHTML = message;
}


function speakResponse(text) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US'; 
        // Optional: Set voice, pitch, and rate for a better bot sound
        utterance.rate = 1.0; 
        
        window.speechSynthesis.speak(utterance);
    } else {
        console.warn('Text-to-Speech not supported in this browser.');
    }
}
// Check auth status on load
async function checkAuthStatus() {
    try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        isAuth = data.authenticated;
        
        if (isAuth) {
            authButton.textContent = 'Calendar Connected';
            authButton.disabled = true;
            micButton.disabled = false;
            updateStatus('Authentication successful. Click the microphone to speak.');
        } else {
            micButton.disabled = true;
            updateStatus('Please click Connect Calendar to begin.', true);
        }
    } catch (e) {
        updateStatus('Server error or not started. Check console.', true);
        console.error("Auth check failed:", e);
    }
}

// --- 1. OAuth Flow Handler ---

authButton.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/auth/google');
        const data = await res.json();
        
        // Open the Google consent screen in a new window/tab
        window.open(data.authUrl, 'googleAuth', 'width=500,height=600');
        updateStatus('Opening Google login window...');
        
        // Polling or using postMessage (simpler here) to check for completion
        window.addEventListener('message', (event) => {
            if (event.data === 'authComplete') {
                checkAuthStatus();
            }
        });
        
    } catch (e) {
        updateStatus('Failed to start authentication.', true);
    }
});


// --- 2. Speech-to-Text (STT) Integration ---

// Use the webkitSpeechRecognition for broader compatibility in modern browsers
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    micButton.addEventListener('click', () => {
        if (!isAuth) {
            updateStatus('Please connect your Google Calendar first.', true);
            return;
        }
        
        micButton.classList.add('active');
        micButton.textContent = '🛑';
        updateStatus('Listening... Speak now.');
        recognition.start();
    });

    recognition.onresult = (event) => {
        const commandText = event.results[0][0].transcript;
        updateStatus(`Heard: "${commandText}"`, false);
        micButton.classList.remove('active');
        micButton.textContent = '🧠'; // Brain icon for processing
        
        // Immediately send the transcribed text to the backend
        processCommand(commandText);
    };

    recognition.onspeechend = () => {
        // Stop recognition once speech ends
        recognition.stop();
    };

    recognition.onerror = (event) => {
        micButton.classList.remove('active');
        micButton.textContent = '🎤';
        updateStatus(`Error: ${event.error}. Click to retry.`, true);
        console.error('Speech recognition error:', event.error);
    };

} else {
    updateStatus('Speech Recognition not supported in this browser. Please use Chrome/Edge.', true);
    micButton.disabled = true;
}


// --- 3. Send Command to Backend ---

async function processCommand(commandText) {
    updateResponse('Processing command with LLM and Calendar API...');
    try {
        const res = await fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commandText })
        });

        const data = await res.json();

        if (data.status === 'success') {
            updateStatus('Command executed successfully!', false);
            updateResponse(`<p style="color: green;">Bot: ${data.message}</p>`);
            
            // --- NEW: Speak the bot's message ---
            speakResponse(data.message);

        } else if (data.status === 'pending') {
             // For the unimplemented query function
             speakResponse(data.message);

        } else {
            speakResponse(data.message);
        }

    } catch (e) {
        updateStatus('Network or server connection failed.', true);
        updateResponse(`<p style="color: red;">Network Error: Could not connect to the backend.</p>`);
        console.error("Fetch error:", e);
    } finally {
        micButton.textContent = '🎤';
    }
}

// Run auth check on page load
document.addEventListener('DOMContentLoaded', checkAuthStatus);