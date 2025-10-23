// index.js

require('dotenv').config();
const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const { parseCommand } = require('./llmParser');
const { 
    getOAuth2Client, 
    setCalendarTokens, 
    isAuthenticated,
    createCalendarEvent, 
    queryCalendarEvents,
    SCOPES 
} = require('./calendarService');

const app = express();

// Serve static files from the 'frontend' directory
app.use(express.static(path.join(__dirname, 'frontend')));
app.use(express.json());

const PORT = process.env.PORT || 9000;

// Serve index.html from the 'frontend' directory for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// OAuth2 Setup
app.get('/api/auth/google', (req, res) => {
    const auth = getOAuth2Client();
    const authUrl = auth.generateAuthUrl({ scope: SCOPES, access_type: 'offline' });
    res.json({ authUrl });
});

app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send('<h1>Authorization Code Missing</h1>');
    }

    try {
        const auth = getOAuth2Client();
        const { tokens } = await auth.getToken(code);
        console.log('Tokens received and set:', tokens);
        setCalendarTokens(tokens);
        res.redirect('http://localhost:9000/?auth=success');
    } catch (error) {
        console.error("Token exchange failed:", error.message);
        res.status(500).send('<h1>Error</h1><p>Token exchange failed. Check server logs.</p>');
    }
});

app.get('/api/auth/status', (req, res) => {
    res.json({ authenticated: isAuthenticated() });
});

// Command Processing
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
            message: "No voice command text received. Please try speaking again." 
        });
    }

    try {
        const parsedCommand = await parseCommand(commandText);
        let botResponse = {};

        if (parsedCommand.intent === 'CREATE_EVENT') {
            const eventDetails = parsedCommand.eventDetails;
            const calendarResult = await createCalendarEvent(eventDetails);
            botResponse = {
                status: 'success',
                message: `Okay, I've scheduled "${calendarResult.title}" starting at ${new Date(calendarResult.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
                data: calendarResult
            };
        } else if (parsedCommand.intent === 'QUERY_EVENTS') {
            const queryDetails = parsedCommand.queryDetails;
            const queryResult = await queryCalendarEvents(queryDetails.targetDate);
            botResponse = {
                status: 'success',
                message: queryResult.message,
                data: queryResult.events
            };
        } else if (parsedCommand.useLocalFallback) {
            botResponse = {
                status: 'error',
                message: 'LLM unavailable. Please use phrases like "schedule a meeting today at 3 PM" or "what’s on my calendar for tomorrow."',
                data: null
            };
        } else {
            botResponse = {
                status: 'error',
                message: "I didn’t understand that. Try 'schedule a meeting' or 'what’s on my calendar.'",
                data: parsedCommand
            };
        }

        res.json(botResponse);
    } catch (error) {
        console.error("Command processing failed:", error.message);
        const userMessage = error.message.includes('authenticated')
            ? "Your calendar connection may have expired. Please reconnect."
            : `Error: ${error.message}`;
        res.status(500).json({ status: 'error', message: userMessage });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});