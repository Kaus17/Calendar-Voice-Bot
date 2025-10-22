let calendarTokens = null; 
// The google object is also required
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

function setCalendarTokens(tokens) {
    calendarTokens = tokens;
    console.log("Calendar tokens successfully set.");
}


/**
 * Checks if the user is authenticated (if tokens are present).
 */
function isAuthenticated() {
    return !!calendarTokens;
}


/**
 * Initializes and returns the OAuth2 client using ENV variables.
 * This is static and doesn't require tokens yet.
 */
function getOAuth2Client() {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
        throw new Error("Missing Google OAuth environment variables.");
    }

    const auth = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI // <-- CRITICAL: This must match the GCP setting
    );
    return auth;
}

/**
 * Stores the tokens received from Google after a successful callback.
 * @param {object} tokens - The tokens object including access_token and refresh_token.
 */




/**
 * Returns the Google Calendar client ready for API calls.
 * Sets the stored tokens and relies on the googleapis client to refresh access tokens.
 * @returns {google.calendar} The authenticated Calendar service client.
 */
function getCalendarClient() {
    if (!calendarTokens) {
        throw new Error('User not authenticated. Calendar tokens are missing.');
    }
    
    const auth = getOAuth2Client();
    auth.setCredentials(calendarTokens);
    
    // We can also attach an event listener to log token refresh, if needed
    auth.on('tokens', (tokens) => {
        if (tokens.refresh_token) {
            calendarTokens.refresh_token = tokens.refresh_token;
            // IMPORTANT: In a production environment, you must save this new 
            // refresh token back to your persistent storage (e.g., database).
        }
        console.log("Access token refreshed automatically.");
    });

    return google.calendar({ version: 'v3', auth });
}

// calendarService.js (Add this new function)

/**
 * Creates a new event in the user's primary Google Calendar.
 * @param {object} details - Structured event details from the LLM parser.
 * @returns {object} The response from the Google Calendar API.
 */
async function createCalendarEvent(details) {
    try {
        const calendar = getCalendarClient();
        
        // --- 1. Construct Date/Time Strings (ISO 8601) ---
        // The LLM should provide date and time in the required formats (YYYY-MM-DD, HH:MM:SS)
        const startDateTime = `${details.date}T${details.startTime}`;
        const endDateTime = details.endTime ? `${details.date}T${details.endTime}` : null;
        
        // Handle time zone: Use 'Z' for UTC or dynamically get the user's time zone.
        // For simplicity in this POC, we'll assume the client is setting the time in their local zone.
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; 

        // --- 2. Build the Event Resource Object ---
        const event = {
            summary: details.title,
            description: details.description || null,
            start: {
                // Use dateTime for specific time events
                dateTime: startDateTime,
                timeZone: timeZone, 
            },
            end: {
                dateTime: endDateTime || startDateTime, // Default end time will be updated below if no end time provided
                timeZone: timeZone,
            },
        };

        // --- 3. Handle Default End Time (1 hour duration) ---
        if (!endDateTime) {
            // If no end time, calculate a default 1-hour duration for the event
            const startTimeObj = new Date(startDateTime);
            startTimeObj.setHours(startTimeObj.getHours() + 1); // Add 1 hour
            
            event.end.dateTime = startTimeObj.toISOString();
        }

        // --- 4. Call the Google Calendar API ---
        const response = await calendar.events.insert({
            calendarId: 'primary', // Use the user's primary calendar
            resource: event,
        });

        // Return a clean confirmation object
        return {
            status: 'success',
            title: response.data.summary,
            htmlLink: response.data.htmlLink,
            start: response.data.start.dateTime,
        };

    } catch (error) {
        console.error("Error creating calendar event:", error.message);
        throw new Error(`Failed to create event: ${error.message}`);
    }
}


/**
 * Queries events from the user's primary calendar for a given date.
 * @param {string} targetDate - The date string in YYYY-MM-DD format.
 * @returns {string} A natural language summary of the events found.
 */
async function queryCalendarEvents(targetDate) {
    try {
        const calendar = getCalendarClient();
        
        // Define the start and end of the day based on the target date
        const timeMin = new Date(`${targetDate}T00:00:00Z`).toISOString();
        const timeMax = new Date(`${targetDate}T23:59:59Z`).toISOString();

        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: timeMin,
            timeMax: timeMax,
            maxResults: 10, // Limit the number of results
            singleEvents: true,
            orderBy: 'startTime',
        });

        const events = response.data.items;

        // --- Generate Natural Language Summary ---
        if (!events || events.length === 0) {
            return `I found no events on your calendar for ${new Date(targetDate).toDateString()}. You are free!`;
        }

        let summary = `On ${new Date(targetDate).toDateString()}, you have ${events.length} events: `;
        
        events.forEach((event, index) => {
            const start = event.start.dateTime || event.start.date;
            // Format time clearly, removing seconds and time zone info
            const startTime = new Date(start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            
            summary += `${index + 1}. ${event.summary} starting at ${startTime}. `;
        });

        return summary;

    } catch (error) {
        console.error("Error querying calendar events:", error.message);
        throw new Error(`Failed to query events: ${error.message}`);
    }
}


async function deleteCalendarEvent(eventId) {
    try {
        const calendar = getCalendarClient();
        
        const response = await calendar.events.delete({
            calendarId: 'primary',
            eventId: eventId,
        });

        return {
            status: 'success',
            message: 'Event deleted successfully.',
        };
    } catch (error) {
        console.error("Error deleting calendar event:", error.message);
        throw new Error(`Failed to delete event: ${error.message}`);
    }
}

module.exports = {
    getOAuth2Client,
    setCalendarTokens,
    getCalendarClient,
    isAuthenticated,
    createCalendarEvent,
    queryCalendarEvents,
    deleteCalendarEvent, // Add this export
    SCOPES
};