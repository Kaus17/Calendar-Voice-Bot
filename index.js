// server.js

// Load environment variables from .env file FIRST
require('dotenv').config(); 

const express = require('express');
const path = require('path');
const cors = require('cors'); 
const helmet = require('helmet'); 

// Import all necessary functions from local service modules
const { 
    getOAuth2Client, 
    setCalendarTokens, 
    isAuthenticated,
    createCalendarEvent, 
    queryCalendarEvents, 
    SCOPES 
} = require('./calendarService'); 
const { parseCommand } = require('./llmParser');

const app = express();
const PORT = 9000;

// =======================================================
// 1. SECURITY AND MIDDLEWARE (CRITICAL ORDER)
// =======================================================

// A. Security Headers (Helmet must come before static files)
// This configuration fixes the Cross-Origin-Opener-Policy issue with the OAuth popup.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));

// B. CORS: Allow requests from the frontend origin
app.use(cors({ origin: 'http://localhost:9000' })); 

// C. Parsing Middleware
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 

// =======================================================
// 2. GOOGLE CALENDAR OAUTH 2.0 ROUTES
// =======================================================

// 1. Route to initiate the OAuth flow
app.get('/api/auth/google', (req, res) => {
    try {
        const auth = getOAuth2Client();

        // Generate the URL for the consent screen
        const authUrl = auth.generateAuthUrl({
            access_type: 'offline', // Requests a Refresh Token
            scope: SCOPES,
            prompt: 'consent' 
        });

        res.json({ authUrl });
    } catch (error) {
        console.error("Error starting OAuth flow:", error.message);
        res.status(500).json({ error: "Authentication setup failed." });
    }
});

// 2. Route to handle the callback from Google
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
// 3. Route to check authentication status (used by the frontend's checkAuthStatus)
app.get('/api/auth/status', (req, res) => {
    try {
        const status = isAuthenticated(); 
        // This is the correct final response
        res.json({ authenticated: status }); 
    } catch (error) {
        console.error("Error in /api/auth/status:", error.message);
        res.status(500).json({ 
            authenticated: false, 
            message: "Backend status check failed." 
        });
        res.status(308).json({ 
            authenticated: true, 
            message: "object Not Modified" 
        });
    }
});

// =======================================================
// 3. MAIN COMMAND PROCESSING ROUTE
// =======================================================

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
        // Step 1: Use the LLM to parse the intent and details
        const parsedCommand = await parseCommand(commandText);
        let botResponse = {};
        
        // Step 2: Act based on the parsed intent
        if (parsedCommand.intent === 'CREATE_EVENT') {
            const eventDetails = parsedCommand.eventDetails;
            
            // Step 3: Execute the Calendar API call
            const calendarResult = await createCalendarEvent(eventDetails);

            botResponse = {
                status: 'success',
                message: `Okay, I've successfully scheduled "${calendarResult.title}" on your calendar starting at ${new Date(calendarResult.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
                data: calendarResult
            };

        } else if (parsedCommand.intent === 'QUERY_EVENTS') {
            const queryDetails = parsedCommand.queryDetails;

            // Step 3: Execute the Calendar API query
            const summaryMessage = await queryCalendarEvents(queryDetails.targetDate);

            botResponse = {
                status: 'success',
                message: summaryMessage,
                data: queryDetails
            };

        } else {
            // Unrecognized intent from LLM
            botResponse = {
                status: 'error',
                message: "I could not identify a valid calendar action (create or query) from your request. Please rephrase your command.",
                data: parsedCommand
            };
        }

        res.json(botResponse);

    } catch (error) {
        // Final safety net for all upstream errors (LLM or Calendar API)
        console.error("Command processing failed:", error.message);
        
        const userMessage = error.message.includes('authenticated') 
            ? "Your calendar connection may have expired. Please try re-connecting your Google Calendar."
            : `I hit an unexpected roadblock: ${error.message}`;
        
        res.status(500).json({ 
            status: 'error', 
            message: userMessage
        });
    }
});

// =======================================================
// 4. STATIC FILE SERVING (MUST BE LAST)
// =======================================================

// Serve static files from the 'frontend' directory
app.use(express.static(path.join(__dirname, 'frontend')));

// =======================================================
// 5. SERVER START
// =======================================================

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`OAuth Redirect URI: ${process.env.GOOGLE_REDIRECT_URI}`);
});