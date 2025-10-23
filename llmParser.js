// llmParser.js

const { GoogleGenAI, Type } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const calendarSchema = {
    type: Type.OBJECT,
    properties: {
        intent: {
            type: Type.STRING,
            description: "The user's intent: 'CREATE_EVENT' to schedule an event or 'QUERY_EVENTS' to ask about the schedule.",
            enum: ['CREATE_EVENT', 'QUERY_EVENTS']
        },
        eventDetails: {
            type: Type.OBJECT,
            description: "Details required for creating a new calendar event.",
            properties: {
                title: { type: Type.STRING, description: "A concise title for the event (e.g., 'Team meeting')." },
                date: { type: Type.STRING, description: "The specific date in YYYY-MM-DD format." },
                startTime: { type: Type.STRING, description: "The starting time in 24-hour format (e.g., 15:00:00)." },
                endTime: { type: Type.STRING, description: "The ending time in 24-hour format (optional)." },
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
        useLocalFallback: {
            type: Type.BOOLEAN,
            description: "Flag to indicate if local fallback parsing should be used due to API failure."
        }
    }
};

/**
 * Parses a natural language command using Gemini or falls back to local parsing.
 * @param {string} commandText - The user's transcribed voice command.
 * @returns {object} A structured object containing the intent and relevant details.
 */
async function parseCommand(commandText) {
    const currentDate = new Date().toISOString().split('T')[0];
    const systemInstruction = `You are a helpful AI assistant for calendar management. The current date is ${currentDate}. Analyze the request (${commandText}) and output a JSON object following the schema. Interpret natural language: for CREATE_EVENT, extract 'title', 'date' (e.g., 'today', 'tomorrow', 'next Monday'), 'startTime', and optionally 'endTime' and 'description'. For QUERY_EVENTS, extract 'targetDate' from phrases like 'what’s on my calendar for today' or 'show me tomorrow’s schedule'. Resolve relative dates and times into YYYY-MM-DD and HH:MM:SS formats. Set 'useLocalFallback' to false unless the API fails.`;

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
        return parseCommandLocally(commandText);
    }
}

/**
 * Local fallback parser for natural language commands.
 * @param {string} commandText - The user's transcribed voice command.
 * @returns {object} A structured object with intent and details.
 */
function parseCommandLocally(commandText) {
    const lowerCommand = commandText.toLowerCase();
    let result = { useLocalFallback: true };

    // Detect intent and extract details
    if (lowerCommand.includes('schedule') || lowerCommand.includes('create') || lowerCommand.includes('set up')) {
        result.intent = 'CREATE_EVENT';
        const titleMatch = commandText.match(/(schedule|create|set up)\s+(.+?)(?:\s+for|\s+at)/i);
        const dateMatch = commandText.match(/\b(today|tomorrow|next\s+monday|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i);
        const timeMatch = commandText.match(/at\s+(\d{1,2}:\d{2}(?:\s?(?:am|pm))?)/i);
        const endTimeMatch = commandText.match(/to\s+(\d{1,2}:\d{2}(?:\s?(?:am|pm))?)/i);
        const descMatch = commandText.match(/for\s+(.+?)(?:\s+at|\s+to|$)/i);

        if (titleMatch && dateMatch) {
            result.eventDetails = {
                title: titleMatch[2].trim(),
                date: resolveDate(dateMatch[1]),
                startTime: timeMatch ? convertTo24Hour(timeMatch[1]) : '09:00:00', // Default to 9 AM if no time
                endTime: endTimeMatch ? convertTo24Hour(endTimeMatch[1]) : null,
                description: descMatch ? descMatch[1].trim() : null
            };
        }
    } else if (lowerCommand.includes('what') && (lowerCommand.includes('have') || lowerCommand.includes('on')) && lowerCommand.includes('calendar')) {
        result.intent = 'QUERY_EVENTS';
        const dateMatch = commandText.match(/\bfor\s+(today|tomorrow|next\s+monday|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i);
        if (dateMatch) result.queryDetails = { targetDate: resolveDate(dateMatch[1]) };
    }

    return result;
}

/**
 * Resolves relative dates to YYYY-MM-DD format.
 * @param {string} dateStr - Relative date string.
 * @returns {string} Formatted date.
 */
function resolveDate(dateStr) {
    const now = new Date('2025-10-23T14:29:00Z'); // Current date and time (2:29 PM IST, October 23, 2025)
    switch (dateStr.toLowerCase()) {
        case 'today': return now.toISOString().split('T')[0];
        case 'tomorrow': return new Date(now.setDate(now.getDate() + 1)).toISOString().split('T')[0];
        case 'next monday':
            const monday = new Date(now);
            monday.setDate(now.getDate() + (1 - now.getDay() + 7) % 7 || 1);
            return monday.toISOString().split('T')[0];
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