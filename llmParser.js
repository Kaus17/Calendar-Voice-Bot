// llmParser.js

const { GoogleGenAI, Type } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const calendarSchema = {
    type: Type.OBJECT,
    properties: {
        intent: {
            type: Type.STRING,
            description: "The user's intent: 'CREATE_EVENT' to schedule an event, 'QUERY_EVENTS' to ask about the schedule, or 'MODIFY_EVENT' to change an existing event.",
            enum: ['CREATE_EVENT', 'QUERY_EVENTS', 'MODIFY_EVENT']
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
        modifyDetails: {
            type: Type.OBJECT,
            description: "Details required for modifying an existing event.",
            properties: {
                eventName: { type: Type.STRING, description: "The name/title of the event to modify (e.g., 'Product call' matches 'Product call with Sharan')." },
                date: { type: Type.STRING, description: "The specific date in YYYY-MM-DD format (optional)." },
                startTime: { type: Type.STRING, description: "The new starting time in 24-hour format (optional)." },
                endTime: { type: Type.STRING, description: "The new ending time in 24-hour format (optional)." },
                description: { type: Type.STRING, description: "The new description (optional)." }
            },
            required: ['eventName']
        },
        useLocalFallback: {
            type: Type.BOOLEAN,
            description: "Flag to indicate if local fallback parsing should be used due to API failure."
        },
        clarificationNeeded: {
            type: Type.OBJECT,
            description: "Details for clarification when multiple events match.",
            properties: {
                message: { type: Type.STRING, description: "Message prompting user for clarification." },
                options: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING, description: "Event ID for reference." },
                            title: { type: Type.STRING, description: "Event title." },
                            startTime: { type: Type.STRING, description: "Event start time." }
                        }
                    }
                }
            },
            required: []
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
    const systemInstruction = `You are a helpful AI assistant for calendar management. The current date is ${currentDate}. Analyze the request (${commandText}) and output a JSON object following the schema. Interpret natural language: for CREATE_EVENT, extract 'title', 'date' (e.g., 'today', 'tomorrow', 'next Monday'), 'startTime', and optionally 'endTime' and 'description'. For QUERY_EVENTS, extract 'targetDate' from phrases like 'what’s on my calendar for today'. For MODIFY_EVENT, extract 'eventName' (e.g., 'Product call' should match 'Product call with Sharan' by ignoring extra details like names), and optional updates to 'date', 'startTime', 'endTime', or 'description' from phrases like 'modify the team meeting to start at 4 PM'. Resolve relative dates and times into YYYY-MM-DD and HH:MM:SS formats. Set 'useLocalFallback' to false unless the API fails. If multiple events might match the 'eventName' for MODIFY_EVENT, include a 'clarificationNeeded' object with a message and a list of matching event options (id, title, startTime).`;

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
                startTime: timeMatch ? convertTo24Hour(timeMatch[1]) : '09:00:00',
                endTime: endTimeMatch ? convertTo24Hour(endTimeMatch[1]) : null,
                description: descMatch ? descMatch[1].trim() : null
            };
        }
    } else if (lowerCommand.includes('what') && (lowerCommand.includes('have') || lowerCommand.includes('on')) && lowerCommand.includes('calendar')) {
        result.intent = 'QUERY_EVENTS';
        const dateMatch = commandText.match(/\bfor\s+(today|tomorrow|next\s+monday|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i);
        if (dateMatch) result.queryDetails = { targetDate: resolveDate(dateMatch[1]) };
    } else if (lowerCommand.includes('modify') || lowerCommand.includes('change') || lowerCommand.includes('update')) {
        result.intent = 'MODIFY_EVENT';
        const nameMatch = commandText.match(/(modify|change|update)\s+the\s+(.+?)(?:\s+to|\s+at)/i);
        const dateMatch = commandText.match(/\b(on|for)\s+(today|tomorrow|next\s+monday|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i);
        const startTimeMatch = commandText.match(/to\s+start\s+at\s+(\d{1,2}:\d{2}(?:\s?(?:am|pm))?)/i);
        const endTimeMatch = commandText.match(/to\s+end\s+at\s+(\d{1,2}:\d{2}(?:\s?(?:am|pm))?)/i);
        const descMatch = commandText.match(/with\s+description\s+(.+?)(?:\s+at|\s+to|$)/i);

        if (nameMatch) {
            result.modifyDetails = { eventName: nameMatch[2].trim().split(' with ')[0].trim() }; // Strip "with Sharan" part
            if (dateMatch) result.modifyDetails.date = resolveDate(dateMatch[2]);
            if (startTimeMatch) result.modifyDetails.startTime = convertTo24Hour(startTimeMatch[1]);
            if (endTimeMatch) result.modifyDetails.endTime = convertTo24Hour(endTimeMatch[1]);
            if (descMatch) result.modifyDetails.description = descMatch[1].trim();
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
    const now = new Date('2025-10-23T15:25:00Z'); // Current date and time (3:25 PM IST, October 23, 2025)
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