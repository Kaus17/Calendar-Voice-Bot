require('dotenv').config(); 

const express = require('express');
const { parseCommand } = require('./llmParser');
const path = require('path');
// Import the functions from your new service module
const { 
    getOAuth2Client, 
    setCalendarTokens, 
    isAuthenticated,
    createCalendarEvent,
    queryCalendarEvents,
    SCOPES 
} = require('./calendarService');
const { parseCommand } = require('./llmParser'); // Import the LLM parser

const app = express();
const PORT = 3000;

// Middleware and static file serving
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));


app.post('/api/command', async (req, res) => {
    const { commandText } = req.body;

    

    if (!isAuthenticated()) {
        return res.status(401).json({ 
            status: 'error', 
            message: "Authentication required. Please connect your Google Calendar first." 
        });
    }

    if (!commandText) {
        return res.status(400).json({ 
            status: 'error', 
            message: "No voice command text received." 
        });
    }

    try {
        // Step 1: Use the LLM to parse the intent and details
        const parsedCommand = await parseCommand(commandText);
        
        // Response object to send back to the user
        let botResponse = {};
        
        // Step 2: Act based on the parsed intent
        if (parsedCommand.intent === 'CREATE_EVENT') {
            const eventDetails = parsedCommand.eventDetails;
            
            // Step 3: Execute the Calendar API call
            const calendarResult = await createCalendarEvent(eventDetails);

            // Step 4: Craft a natural language response
            botResponse = {
                status: 'success',
                // This is the spoken/displayed confirmation message
                message: `Okay, I've successfully scheduled "${calendarResult.title}" on your calendar starting at ${new Date(calendarResult.start).toLocaleTimeString()}.`,
                data: calendarResult
            };

        } else if (parsedCommand.intent === 'QUERY_EVENTS') {
            const queryDetails = parsedCommand.queryDetails;
            const summaryMessage = await queryCalendarEvents(queryDetails.targetDate);
            botResponse = {
                status: 'success',
                message: summaryMessage, // The summary is the message
                data: queryDetails
            };

        } else {
            botResponse = {
                status: 'error',
                message: "I could not identify a valid calendar action (create or query) from your request. Please speak clearly.",
                data: parsedCommand
            };
        }

        res.json(botResponse);

    } catch (error) {
        console.error("Command processing failed:", error.message);
        res.status(500).json({ 
            status: 'error', 
            message: `A critical error occurred while processing your request: ${error.message}` 
        });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});


// --- 1. Route to Initiate Authentication ---
app.get('/api/auth/google', (req, res) => {
    try {
        const auth = getOAuth2Client();
        const authUrl = auth.generateAuthUrl({
            access_type: 'offline', 
            scope: SCOPES,
            prompt: 'consent'
        });
        res.json({ authUrl });
    } catch (error) {
        console.error("Error starting OAuth flow:", error.message);
        res.status(500).json({ error: "Authentication setup failed." });
    }
});

// --- 2. Route to Handle the Callback ---
app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send('Authorization code missing.');
    }

    try {
        const auth = getOAuth2Client();
        const { tokens } = await auth.getToken(code);
        
        // Use the function from the service module to set the tokens
        setCalendarTokens(tokens); 

        // Send a success message and script to close the popup/tab
        res.send('<h1>Authentication Successful!</h1><p>You can close this window and return to the voice bot.</p><script>window.close();</script>');
    } catch (error) {
        console.error("Error retrieving access tokens:", error.message);
        res.status(500).send('Token exchange failed. Check server logs.');
    }
});

// --- Optional: Check Authentication Status ---
app.get('/api/auth/status', (req, res) => {
    res.json({ authenticated: isAuthenticated() });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});