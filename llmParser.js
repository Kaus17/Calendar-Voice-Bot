// llmParser.js

const { GoogleGenAI, Type } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const calendarSchema = {
    type: Type.OBJECT,
    properties: {
        intent: {
            type: Type.STRING,
            description: "The user's intent: 'CREATE_EVENT' to schedule an event, 'QUERY_EVENTS' to ask about the schedule, or 'DELETE_EVENT' to remove an event.",
            enum: ['CREATE_EVENT', 'QUERY_EVENTS', 'DELETE_EVENT']
        },
        eventDetails: {
            type: Type.OBJECT,
            description: "Details required for creating a new calendar event.",
            properties: {
                title: { type: Type.STRING, description: "A concise title for the event." },
                date: { type: Type.STRING, description: "The specific date in YYYY-MM-DD format." },
                startTime: { type: Type.STRING, description: "The starting time in 24-hour format." },
                endTime: { type: Type.STRING, description: "The ending time in 24-hour format." },
                description: { type: Type.STRING, description: "Optional notes or description." }
            },
            required: ['title', 'date', 'startTime']
        },
        queryDetails: {
            type: Type.OBJECT,
            description: "Details required for querying events.",
            properties: {
                targetDate: { type: Type.STRING, description: "The specific date to query in YYYY-MM-DD format." }
            },
            required: ['targetDate']
        },
        deleteDetails: {
            type: Type.OBJECT,
            description: "Details required for deleting an event.",
            properties: {
                eventId: { type: Type.STRING, description: "The unique ID of the event to delete." },
                title: { type: Type.STRING, description: "The title of the event to help identify it." },
                date: { type: Type.STRING, description: "The date of the event in YYYY-MM-DD format." },
                startTime: { type: Type.STRING, description: "The starting time in 24-hour format." }
            },
            required: []
        },
        useLocalFallback: {
            type: Type.BOOLEAN,
            description: "Flag to indicate if local fallback parsing should be used due to API failure."
        }
    }
};

/**
 * Parses a natural language command using Gemini or falls back to local parsing.
 * @param {string} commandText - The user's transcribed voice command.
 * @param {Array} context - Optional array of event objects for context.
 * @returns {object} A structured object containing the intent and relevant details.
 */
async function parseCommand(commandText, context = []) {
    const currentDate = new Date().toISOString().split('T')[0];
    const formattedContext = context.map(event => ({
        id: event.id,
        title: event.summary,
        date: event.start.dateTime ? new Date(event.start.dateTime).toISOString().split('T')[0] : null,
        startTime: event.start.dateTime ? new Date(event.start.dateTime).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : null
    })).filter(event => event.date);

    const systemInstruction = `You are a strict AI assistant for calendar management. The current date is ${currentDate}. Analyze the request (${commandText}) and output a JSON object following the schema. Resolve relative dates (e.g., 'today', 'tomorrow') into YYYY-MM-DD and times into HH:MM:SS. For CREATE_EVENT, resolve 'startTime' and 'endTime'. For QUERY_EVENTS, resolve 'targetDate'. For DELETE_EVENT, extract 'eventId', 'title', 'date', or 'startTime' from the command. Context: ${JSON.stringify(formattedContext)}. Set 'useLocalFallback' to false unless the API is unavailable.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: commandText }] }],
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: calendarSchema,
            },
        });

        return JSON.parse(response.text);
    } catch (error) {
        console.error("LLM Parsing Error (falling back to local):", error);
        return parseCommandLocally(commandText, context);
    }
}

/**
 * Local fallback parser using regular expressions.
 * @param {string} commandText - The user's transcribed voice command.
 * @param {Array} context - Array of event objects for matching.
 * @returns {object} A structured object with intent and details.
 */
function parseCommandLocally(commandText, context) {
    const lowerCommand = commandText.toLowerCase();
    let result = { intent: 'ERROR', useLocalFallback: true };

    // Detect intent
    if (lowerCommand.includes('schedule') || lowerCommand.includes('create')) {
        result.intent = 'CREATE_EVENT';
        const titleMatch = commandText.match(/schedule|create\s+(.+?)(?:\s+for|\s+at)/i);
        const dateMatch = commandText.match(/\b(today|tomorrow|this\s+friday|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i);
        const timeMatch = commandText.match(/at\s+(\d{1,2}:\d{2}(?:\s?(?:am|pm))?)/i);

        if (titleMatch && dateMatch && timeMatch) {
            result.eventDetails = {
                title: titleMatch[1].trim(),
                date: resolveDate(dateMatch[1]),
                startTime: convertTo24Hour(timeMatch[1]),
            };
        }
    } else if (lowerCommand.includes('what do i have') || lowerCommand.includes('query')) {
        result.intent = 'QUERY_EVENTS';
        const dateMatch = commandText.match(/\bfor\s+(today|tomorrow|this\s+friday|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i);
        if (dateMatch) result.queryDetails = { targetDate: resolveDate(dateMatch[1]) };
    } else if (lowerCommand.includes('remove') || lowerCommand.includes('delete')) {
        result.intent = 'DELETE_EVENT';
        const titleMatch = commandText.match(/remove|delete\s+the\s+(.+?)(?:\s+on|\s+at)/i);
        const dateMatch = commandText.match(/\bon\s+(today|tomorrow|this\s+friday|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i);
        const timeMatch = commandText.match(/at\s+(\d{1,2}:\d{2}(?:\s?(?:am|pm))?)/i);

        result.deleteDetails = {};
        if (titleMatch) result.deleteDetails.title = titleMatch[1].trim();
        if (dateMatch) result.deleteDetails.date = resolveDate(dateMatch[1]);
        if (timeMatch) result.deleteDetails.startTime = convertTo24Hour(timeMatch[1]);

        // Match with context if available
        if (context.length > 0 && result.deleteDetails.date) {
            const matchedEvent = context.find(event =>
                (!result.deleteDetails.title || event.title.toLowerCase().includes(result.deleteDetails.title.toLowerCase())) &&
                event.date === result.deleteDetails.date &&
                (!result.deleteDetails.startTime || event.startTime === result.deleteDetails.startTime)
            );
            if (matchedEvent) result.deleteDetails.eventId = matchedEvent.id;
        }
    }

    return result;
}

/**
 * Resolves relative dates to YYYY-MM-DD format.
 * @param {string} dateStr - Relative date string.
 * @returns {string} Formatted date.
 */
function resolveDate(dateStr) {
    const now = new Date('2025-10-22T23:21:00Z'); // Current date and time (11:21 PM IST, October 22, 2025)
    switch (dateStr.toLowerCase()) {
        case 'today': return now.toISOString().split('T')[0];
        case 'tomorrow': return new Date(now.setDate(now.getDate() + 1)).toISOString().split('T')[0];
        case 'this friday':
            const friday = new Date(now);
            friday.setDate(now.getDate() + (5 - now.getDay() + 7) % 7 || 5);
            return friday.toISOString().split('T')[0];
        default:
            const [month, day, year] = dateStr.split('/');
            return year ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` : now.toISOString().split('T')[0];
    }
}

/**
 * Converts 12-hour time to 24-hour format.
 * @param {string} timeStr - Time in 12-hour format (e.g., "3:00 pm").
 * @returns {string} Time in 24-hour format (e.g., "15:00:00").
 */
function convertTo24Hour(timeStr) {
    const [time, modifier] = timeStr.toLowerCase().split(/\s+/);
    let [hours, minutes] = time.split(':');
    hours = parseInt(hours, 10);
    if (modifier === 'pm' && hours !== 12) hours += 12;
    if (modifier === 'am' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${minutes.padStart(2, '0')}:00`;
}

module.exports = { parseCommand };