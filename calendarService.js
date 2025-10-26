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

async function queryCalendarEvents(targetDate, eventName = null) {
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
            q: eventName, // Search by event name if provided
        });

        const events = response.data.items || [];
        if (events.length === 0) {
            return { status: 'success', message: `No events found on ${new Date(targetDate).toDateString()} matching '${eventName || 'any'}'. You are free!`, events: [] };
        }

        let summary = `On ${new Date(targetDate).toDateString()}, you have ${events.length} events:\n`;
        const eventList = events.map((event, index) => {
            const start = event.start.dateTime || event.start.date;
            const startTime = new Date(start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const eventInfo = `${index + 1}. ${event.summary} at ${startTime}`;
            summary += `${eventInfo}\n`;
            return { id: event.id, title: event.summary, startTime, date: targetDate, startDateTime: start };
        });
        return { status: 'success', message: summary, events: eventList };
    } catch (error) {
        console.error("Error querying calendar events:", error.message);
        throw new Error(`Failed to query events: ${error.message}`);
    }
}

async function modifyCalendarEvent(eventId, details) {
    console.log('modifyCalendarEvent input:', { eventId, details });
    try {
        const calendar = getCalendarClient();
        const event = await calendar.events.get({ calendarId: 'primary', eventId });
        console.log('Current event:', {
            id: event.data.id,
            summary: event.data.summary,
            start: event.data.start,
            end: event.data.end,
            description: event.data.description
        });
        const updatedEvent = { ...event.data };

        const timeZone = 'Asia/Kolkata'; // Standardize to IST
        let startDateTime, endDateTime;

        // Calculate original duration
        const originalStart = new Date(updatedEvent.start.dateTime);
        const originalEnd = updatedEvent.end.dateTime ? new Date(updatedEvent.end.dateTime) : new Date(originalStart.getTime() + 60 * 60 * 1000); // Default 1 hour
        const originalDuration = (originalEnd - originalStart) / (1000 * 60); // Duration in minutes

        // Update start time and date
        if (details.date || details.startTime) {
            const currentStartDate = new Date(updatedEvent.start.dateTime).toISOString().split('T')[0];
            const currentStartTime = new Date(updatedEvent.start.dateTime).toISOString().split('T')[1].slice(0, 8);
            startDateTime = `${details.date || currentStartDate}T${details.startTime || currentStartTime}`;
            updatedEvent.start = { dateTime: startDateTime, timeZone };
        } else {
            startDateTime = updatedEvent.start.dateTime;
        }

        // Update end time
        if (details.endTime) {
            const currentEndDate = updatedEvent.end.dateTime ? new Date(updatedEvent.end.dateTime).toISOString().split('T')[0] : details.date || new Date(updatedEvent.start.dateTime).toISOString().split('T')[0];
            endDateTime = `${details.date || currentEndDate}T${details.endTime}`;
            updatedEvent.end = { dateTime: endDateTime, timeZone };
        } else if (startDateTime) {
            // Adjust endTime to maintain original duration
            const newStart = new Date(startDateTime);
            endDateTime = new Date(newStart.getTime() + originalDuration * 60 * 1000).toISOString();
            updatedEvent.end = { dateTime: endDateTime, timeZone };
            console.log('Adjusted endTime to maintain duration:', { originalDuration, endDateTime });
        } else {
            endDateTime = updatedEvent.end.dateTime;
        }

        // Validate time range
        console.log('Time range validation:', { startDateTime, endDateTime });
        if (startDateTime && endDateTime) {
            const start = new Date(startDateTime);
            const end = new Date(endDateTime);
            if (isNaN(start) || isNaN(end)) {
                const result = {
                    clarificationNeeded: {
                        message: `Invalid date or time format. Start: ${startDateTime}, End: ${endDateTime}. Please provide valid times (e.g., '9:00 PM').`,
                        options: []
                    }
                };
                console.log('modifyCalendarEvent output:', result);
                return result;
            }
            if (start >= end) {
                const result = {
                    clarificationNeeded: {
                        message: `The time range from ${details.startTime || new Date(updatedEvent.start.dateTime).toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })} to ${details.endTime || new Date(endDateTime).toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })} is invalid. Please provide an end time after the start time (e.g., 'modify product meeting to start at 9:00 PM and end at 10:00 PM').`,
                        options: []
                    }
                };
                console.log('modifyCalendarEvent output:', result);
                return result;
            }
        }

        if (details.description) updatedEvent.description = details.description;

        console.log('Updating event with:', {
            id: updatedEvent.id,
            summary: updatedEvent.summary,
            start: updatedEvent.start,
            end: updatedEvent.end,
            description: updatedEvent.description
        });

        const response = await calendar.events.update({
            calendarId: 'primary',
            eventId,
            resource: updatedEvent
        });
        console.log('Google Calendar API response:', {
            id: response.data.id,
            summary: response.data.summary,
            start: response.data.start,
            end: response.data.end,
            status: response.data.status,
            updated: response.data.updated
        });

        const result = {
            status: 'success',
            message: `Event '${updatedEvent.summary}' modified successfully to start at ${new Date(updatedEvent.start.dateTime).toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })}.`
        };
        console.log('modifyCalendarEvent output:', result);
        return result;
    } catch (error) {
        console.error('Error modifying calendar event:', error.message, error.stack);
        const errorResult = {
            clarificationNeeded: {
                message: `Failed to modify event: ${error.message}. Please ensure the event exists and provide a valid time range (e.g., 'modify product meeting to start at 9:00 PM and end at 10:00 PM').`,
                options: []
            }
        };
        console.log('modifyCalendarEvent output:', errorResult);
        return errorResult;
    }
}

async function deleteCalendarEvents({ targetDate, startTime, endTime }) {
    console.log('deleteCalendarEvents input:', { targetDate, startTime, endTime });
    try {
        const calendar = getCalendarClient();
        const timeMin = new Date(`${targetDate}T00:00:00Z`).toISOString();
        const timeMax = new Date(`${targetDate}T23:59:59Z`).toISOString();

        // Validate time range if provided
        if (startTime && endTime) {
            const startDateTime = new Date(`${targetDate}T${startTime}Z`);
            const endDateTime = new Date(`${targetDate}T${endTime}Z`);
            if (startDateTime >= endDateTime) {
                const result = {
                    clarificationNeeded: {
                        message: `The time range from ${startTime} to ${endTime} is invalid or empty. Please provide a valid time range (e.g., 'between 4:00 pm and 6:00 pm').`,
                        options: []
                    }
                };
                console.log('deleteCalendarEvents output:', result);
                return result;
            }
        } else if (startTime || endTime) {
            const result = {
                clarificationNeeded: {
                    message: `Please provide both a start and end time for the range (e.g., 'between 4:00 pm and 6:00 pm').`,
                    options: []
                }
            };
            console.log('deleteCalendarEvents output:', result);
            return result;
        }

        // Query events for the target date
        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: timeMin,
            timeMax: timeMax,
            maxResults: 100,
            singleEvents: true,
            orderBy: 'startTime'
        });

        const events = response.data.items || [];
        let deletedCount = 0;

        for (const event of events) {
            const eventStart = new Date(event.start.dateTime || event.start.date);
            const eventStartTime = eventStart.toISOString().slice(11, 19); // Extract HH:MM:SS

            // If time range is specified, only delete events within the range
            if (startTime && endTime) {
                if (eventStartTime >= startTime && eventStartTime < endTime) {
                    await calendar.events.delete({ calendarId: 'primary', eventId: event.id });
                    deletedCount++;
                }
            } else {
                // Delete all events on the target date
                await calendar.events.delete({ calendarId: 'primary', eventId: event.id });
                deletedCount++;
            }
        }

        const result = {
            status: 'success',
            message: deletedCount > 0
                ? startTime && endTime
                    ? `Deleted ${deletedCount} meeting${deletedCount === 1 ? '' : 's'} between ${startTime} and ${endTime} on ${new Date(targetDate).toDateString()}.`
                    : `Deleted ${deletedCount} meeting${deletedCount === 1 ? '' : 's'} on ${new Date(targetDate).toDateString()}.`
                : startTime && endTime
                    ? `No meetings found between ${startTime} and ${endTime} on ${new Date(targetDate).toDateString()}.`
                    : `No meetings found on ${new Date(targetDate).toDateString()}.`
        };
        console.log('deleteCalendarEvents output:', result);
        return result;
    } catch (error) {
        console.error("Error deleting calendar events:", error.message);
        const errorResult = { clarificationNeeded: { message: `Failed to delete events: ${error.message}`, options: [] } };
        console.log('deleteCalendarEvents output:', errorResult);
        return errorResult;
    }
}

module.exports = {
    getOAuth2Client,
    setCalendarTokens,
    getCalendarClient,
    isAuthenticated,
    createCalendarEvent,
    queryCalendarEvents,
    modifyCalendarEvent,
    deleteCalendarEvents,
    SCOPES
};