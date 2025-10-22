// frontend/app.js
const authButton = document.getElementById('authButton');
const micButton = document.getElementById('micButton');
const statusDiv = document.getElementById('status');
const responseDiv = document.getElementById('response');
const statusCheckButton = document.getElementById('statusCheckButton');

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
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
    } else {
        console.warn('Text-to-Speech not supported in this browser.');
    }
}

async function requestMicrophonePermission() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        micButton.disabled = false;
        micButton.textContent = '🎤';
        updateStatus('Authentication successful. Microphone is ready. Click to speak.');
    } catch (err) {
        micButton.disabled = true;
        micButton.textContent = '🚫';
        updateStatus('Microphone permission required to proceed.', true);
        console.error('Microphone access denied:', err);
    }
}

async function checkAuthStatus() {
    updateStatus('Checking calendar connection status...');
    try {
        const res = await fetch('/api/auth/status');
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        isAuth = data.authenticated;

        if (isAuth) {
            authButton.textContent = 'Calendar Connected';
            authButton.disabled = true;
            authButton.style.display = 'block';
            statusCheckButton.style.display = 'none';
            await requestMicrophonePermission();
        } else {
            authButton.style.display = 'block';
            statusCheckButton.style.display = 'none';
            micButton.disabled = true;
            updateStatus('Please click Connect Calendar to begin.', true);
        }
    } catch (e) {
        console.error('Auth check failed:', e);
        authButton.style.display = 'block';
        statusCheckButton.style.display = 'none';
        micButton.disabled = true;
        updateStatus('Cannot connect to the backend. Ensure the server is running (`node index.js`).', true);
    }
}

// --- Authentication Flow (Redirect-Based) ---
authButton.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/auth/google');
        const data = await res.json();
        window.location.href = data.authUrl; // Redirect the entire page to the OAuth flow
    } catch (e) {
        updateStatus('Failed to start authentication.', true);
        authButton.style.display = 'block';
    }
});

// --- Handle Page Load and Redirect ---
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'success') {
        checkAuthStatus();
        window.history.replaceState({}, document.title, window.location.pathname); // Clear URL param
    } else {
        checkAuthStatus(); // Check status on initial load
    }
});

// Remove statusCheckButton listener since redirect handles the flow
// statusCheckButton.addEventListener('click', checkAuthStatus); // Commented out

// --- Speech-to-Text Integration ---
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
        micButton.textContent = '🧠';
        
        processCommand(commandText);
    };

    recognition.onspeechend = () => {
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

// --- Command Processing ---
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
            speakResponse(data.message);
        } else {
            updateStatus('Command failed.', true);
            updateResponse(`<p style="color: red;">Bot: ${data.message}</p>`);
            speakResponse(data.message);
        }
    } catch (e) {
        updateStatus('Network or server connection failed.', true);
        updateResponse(`<p style="color: red;">Network Error: Could not connect to the backend.</p>`);
        console.error('Fetch error:', e);
    } finally {
        micButton.textContent = '🎤';
    }
}