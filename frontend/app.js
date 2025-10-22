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
        // Optional: Set voice, pitch, and rate for a better bot sound
        utterance.rate = 1.0; 
        
        window.speechSynthesis.speak(utterance);
    } else {
        console.warn('Text-to-Speech not supported in this browser.');
    }
}
// Check auth status on load
async function checkAuthStatus() {
    updateStatus('Checking calendar connection status...');
    
    try {
        const res = await fetch('/api/auth/status');
        
        // --- NEW: Check for 304 (Not Modified) or 204 (No Content) ---
        // If the status is 304, we treat it as an implicit success (authenticated status hasn't changed)
        if (res.status === 304) {
            // Since we hit 304, we assume the authentication is complete from the previous success.
            // We can now proceed directly to update the UI as success.
            isAuth = true; 
        } 
        // Check for general HTTP errors (e.g., 4xx, 5xx)
        else if (!res.ok) {
            throw new Error(`Server status check failed with HTTP code: ${res.status}`);
        }
        // If status is 200, proceed to parse the JSON
        else {
            const data = await res.json();
            isAuth = data.authenticated;
        }

        // --- Authentication Check (The rest of the logic) ---
        if (isAuth) {
            // Authentication SUCCESS path
            authButton.textContent = 'Calendar Connected';
            authButton.disabled = true;
            authButton.style.display = 'block'; 
            statusCheckButton.style.display = 'none'; // Hide manual button on success
            
            await requestMicrophonePermission(); // Proceed to mic check
            
        } else {
            // Authentication FAILURE path
            authButton.style.display = 'block'; 
            statusCheckButton.style.display = 'none'; 
            micButton.disabled = true;
            updateStatus('Please click Connect Calendar to begin.', true);
        }
        
    } catch (e) {
        // ... (existing catch block for network errors) ...
        console.error("Auth check failed:", e);
        
        authButton.style.display = 'block';
        statusCheckButton.style.display = 'none';
        micButton.disabled = true;
        
        updateStatus('Cannot connect to the backend server. Please ensure the server is running (`node server.js`).', true);
    }
}


async function requestMicrophonePermission() {
    try {
        // Request media access (will prompt the user)
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Stop the stream immediately after permission is granted
        stream.getTracks().forEach(track => track.stop()); 
        
        // Permission granted
        micButton.disabled = false;
        micButton.textContent = '🎤';
        updateStatus('Authentication successful. Microphone is ready. Click the microphone to speak.');

    } catch (err) {
        // Permission denied or stream error
        micButton.disabled = true;
        micButton.textContent = '🚫';
        updateStatus('Authentication successful, but **Microphone Permission is Required** to proceed.', true);
        console.error('Microphone access denied:', err);
    }
}


async function checkAuthStatus() {
    try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        isAuth = data.authenticated;
        
        if (isAuth) {
            authButton.textContent = 'Calendar Connected';
            authButton.disabled = true;
            
            // --- NEW: Request mic permission immediately after successful auth ---
            await requestMicrophonePermission(); 
            
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
        
        // 1. Update the UI to reflect the next step
        authButton.style.display = 'none';
        statusCheckButton.style.display = 'block'; // SHOW THE NEW BUTTON
        updateStatus('Authentication window opened. **It should close automatically** after granting permission. Please click the green button to finish synchronizing.');        
        // Note: We remove the complex polling logic and rely on the user's click
        
    } catch (e) {
        updateStatus('Failed to start authentication.', true);
        authButton.style.display = 'block'; // Show original button on failure
    }
});

// --- 2. New Event Listener for Manual Status Check ---

statusCheckButton.addEventListener('click', async () => {
    updateStatus('Checking calendar connection...');
    await checkAuthStatus();
    
    // If checkAuthStatus succeeds, it handles enabling the mic and hiding this button.
    
    // If checkAuthStatus fails, we keep this button visible and update the status message.
    if (!isAuth) {
        updateStatus('Connection check failed. Did you grant permission? Try again.', true);
    }
});


// --- 3. Update checkAuthStatus to hide the new button on success ---

async function checkAuthStatus() {
    // Show a loading message while the status is being fetched
    updateStatus('Checking calendar connection status...');
    
    try {
        // --- Try Block: External API Call ---
        // This is the network call to the backend /api/auth/status
        const res = await fetch('/api/auth/status');
        
        // Check for HTTP errors (e.g., 500 server error)
        if (!res.ok) {
            throw new Error(`Server status check failed with HTTP code: ${res.status}`);
        }
        
        const data = await res.json();
        isAuth = data.authenticated;
        
        if (isAuth) {
            // Authentication SUCCESS path
            authButton.textContent = 'Calendar Connected';
            authButton.disabled = true;
            authButton.style.display = 'block'; 
            statusCheckButton.style.display = 'none'; // Hide manual button on success
            
            await requestMicrophonePermission(); // Proceed to mic check
            
        } else {
            // Authentication FAILURE path (Backend says tokens are NOT set)
            authButton.style.display = 'block'; // Show original button for retry
            statusCheckButton.style.display = 'none'; 
            micButton.disabled = true;
            updateStatus('Please click Connect Calendar to begin.', true);
        }
        
    } catch (e) {
        // --- Catch Block: Handles Network Failures, CORS, or Server Errors ---
        console.error("Auth check failed:", e);
        
        // Keep the UI in a state that allows recovery
        authButton.style.display = 'block';
        statusCheckButton.style.display = 'none';
        micButton.disabled = true;
        
        // Provide clear feedback to the user
        updateStatus('Cannot connect to the backend server. Please ensure the server is running (`node server.js`).', true);
    }
}


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


let authWindow = null; 

// --- 1. OAuth Flow Handler ---

authButton.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/auth/google');
        const data = await res.json();
        
        // Open the Google consent screen in a new window/tab
        window.open(data.authUrl, 'googleAuth', 'width=500,height=600');
        
        // Update the UI to show the manual sync button and instructions
        authButton.style.display = 'none';
        statusCheckButton.style.display = 'block'; 
        updateStatus('Authentication window opened. Please grant permission and close the window, then click the green button below.');
        
        // *** CRITICAL: Ensure ALL previous polling/message-passing logic is removed here. ***
        
    } catch (e) {
        updateStatus('Failed to start authentication.', true);
        authButton.style.display = 'block'; 
    }
});

async function checkAuthStatus() {}


// Run auth check on page load
document.addEventListener('DOMContentLoaded', checkAuthStatus);