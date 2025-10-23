let calendarTokens = null;
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

function setCalendarTokens(tokens) {
    calendarTokens = tokens;
    console.log("Calendar tokens successfully set.");
}

function isAuthenticated() {
    return !!calendarTokens;
}

function getOAuth2Client() {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
        throw new Error("Missing Google OAuth environment variables.");
    }
    const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
    return auth;
}

function getCalendarClient() {
    if (!calendarTokens) {
        throw new Error('User not authenticated. Calendar tokens are missing.');
    }
    const auth = getOAuth2Client();
    auth.setCredentials(calendarTokens);
    auth.on('tokens', (tokens) => {
        if (tokens.refresh_token) {
            calendarTokens.refresh_token = tokens.refresh_token;
        }
        console.log("Access token refreshed automatically.");
    });
    return google.calendar({ version: 'v3', auth });
}

async function createCalendarEvent(details) {
    try {
        const calendar = getCalendarClient();
        const startDateTime = `${details.date}T${details.startTime}`;
        const endDateTime = details.endTime ? `${details.date}T${details.endTime}` : null;
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

        const event = {
            summary: details.title,
            description: details.description || null,
            start: { dateTime: startDateTime, timeZone },
            end: { dateTime: endDateTime || startDateTime, timeZone },
        };

        if (!endDateTime) {
            const startTimeObj = new Date(startDateTime);
            startTimeObj.setHours(startTimeObj.getHours() + 1);
            event.end.dateTime = startTimeObj.toISOString();
        }

        const response = await calendar.events.insert({ calendarId: 'primary', resource: event });
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

async function queryCalendarEvents(targetDate) {
    try {
        const calendar = getCalendarClient();
        const timeMin = new Date(`${targetDate}T00:00:00Z`).toISOString();
        const timeMax = new Date(`${targetDate}T23:59:59Z`).toISOString();

        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: timeMin,
            timeMax: timeMax,
            maxResults: 10,
            singleEvents: true,
            orderBy: 'startTime',
        });

        const events = response.data.items || [];
        if (events.length === 0) {
            return { status: 'success', message: `No events found on ${new Date(targetDate).toDateString()}. You are free!`, events: [] };
        }

        let summary = `On ${new Date(targetDate).toDateString()}, you have ${events.length} events:\n`;
        const eventList = events.map((event, index) => {
            const start = event.start.dateTime || event.start.date;
            const startTime = new Date(start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const eventInfo = `${index + 1}. ${event.summary} at ${startTime}`;
            summary += `${eventInfo}\n`;
            return { title: event.summary, startTime, date: targetDate };
        });
        return { status: 'success', message: summary, events: eventList };
    } catch (error) {
        console.error("Error querying calendar events:", error.message);
        throw new Error(`Failed to query events: ${error.message}`);
    }
}

module.exports = {
    getOAuth2Client,
    setCalendarTokens,
    getCalendarClient,
    isAuthenticated,
    createCalendarEvent,
    queryCalendarEvents,
    SCOPES
};