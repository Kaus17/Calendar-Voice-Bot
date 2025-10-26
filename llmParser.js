const { GoogleGenAI, Type } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const calendarSchema = {
    type: Type.OBJECT,
    properties: {
        intent: {
            type: Type.STRING,
            description: "The user's intent: 'CREATE_EVENT' to schedule an event, 'QUERY_EVENTS' to ask about the schedule, 'MODIFY_EVENT' to change an existing event, or 'DELETE_EVENTS' to cancel events.",
            enum: ['CREATE_EVENT', 'QUERY_EVENTS', 'MODIFY_EVENT', 'DELETE_EVENTS']
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
        deleteDetails: {
            type: Type.OBJECT,
            description: "Details required for deleting events.",
            properties: {
                targetDate: { type: Type.STRING, description: "The specific date to delete events from in YYYY-MM-DD format." },
                startTime: { type: Type.STRING, description: "The start of the time range in 24-hour format (optional, e.g., 16:00:00)." },
                endTime: { type: Type.STRING, description: "The end of the time range in 24-hour format (optional, e.g., 18:00:00)." }
            },
            required: ['targetDate']
        },
        useLocalFallback: {
            type: Type.BOOLEAN,
            description: "Flag to indicate if local fallback parsing should be used due to API failure."
        },
        clarificationNeeded: {
            type: Type.OBJECT,
            description: "Details for clarification when multiple events match or input is invalid.",
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

async function parseCommand(commandText) {
    console.log('parseCommand input:', commandText);
    const currentDate = new Date().toISOString().split('T')[0];
    const systemInstruction = `You are a helpful AI assistant for calendar management. The current date is ${currentDate}. Analyze the request (${commandText}) and output a JSON object following the schema. Interpret natural language: 
    - For CREATE_EVENT, extract 'title', 'date' (e.g., 'today', 'tomorrow', 'next Monday'), 'startTime', and optionally 'endTime' and 'description'. 
    - For QUERY_EVENTS, extract 'targetDate' from phrases like 'what’s on my calendar for today'. 
    - For MODIFY_EVENT, extract 'eventName' (e.g., 'Product call' should match 'Product call with Sharan' by ignoring extra details like names), and optional updates to 'date', 'startTime', 'endTime', or 'description' from phrases like 'modify the team meeting to start at 4 PM'. 
    - For DELETE_EVENTS, identify commands like 'cancel all my meetings today' or 'cancel all my meetings between 4 pm and 6 pm today'. Extract 'targetDate' (required) and optionally 'startTime' and 'endTime' for a time range in 24-hour format (e.g., 16:00:00 to 18:00:00). If the time range is invalid (startTime >= endTime), include a 'clarificationNeeded' object with a message. 
    Resolve relative dates and times into YYYY-MM-DD and HH:MM:SS formats. Set 'useLocalFallback' to false unless the API fails. If multiple events might match the 'eventName' for MODIFY_EVENT, include a 'clarificationNeeded' object with a message and a list of matching event options (id, title, startTime).`;

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

        const parsedResult = JSON.parse(response.text);
        console.log('AI parsed result:', JSON.stringify(parsedResult, null, 2));
        return parsedResult;
    } catch (error) {
        console.error("LLM Parsing Error (falling back to local):", error.message);
        const localResult = parseCommandLocally(commandText);
        console.log('Local parsed result:', JSON.stringify(localResult, null, 2));
        return localResult;
    }
}

function parseCommandLocally(commandText) {
    console.log('parseCommandLocally input:', commandText);
    const lowerCommand = commandText.toLowerCase();
    let result = { useLocalFallback: true };

    if (lowerCommand.includes('cancel') || lowerCommand.includes('delete')) {
        result.intent = 'DELETE_EVENTS';
        const dateMatch = commandText.match(/\b(on|for)?\s*(today|tomorrow|next\s+monday|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i);
        const timeRangeMatch = commandText.match(/between\s+(\d{1,2}:\d{2}(?:\s?(?:am|pm))?)\s+(?:and|to)\s+(\d{1,2}:\d{2}(?:\s?(?:am|pm))?)/i);

        console.log('DELETE_EVENTS matches:', { dateMatch, timeRangeMatch });

        if (dateMatch) {
            result.deleteDetails = { targetDate: resolveDate(dateMatch[2]) };
            if (timeRangeMatch) {
                const startTime = convertTo24Hour(timeRangeMatch[1]);
                const endTime = convertTo24Hour(timeRangeMatch[2]);
                if (startTime >= endTime) {
                    result.clarificationNeeded = {
                        message: `The time range from ${timeRangeMatch[1]} to ${timeRangeMatch[2]} is invalid. Please provide a valid time range (e.g., 'between 4:00 pm and 6:00 pm').`,
                        options: []
                    };
                    delete result.deleteDetails;
                } else {
                    result.deleteDetails.startTime = startTime;
                    result.deleteDetails.endTime = endTime;
                }
            }
        } else {
            result.clarificationNeeded = {
                message: `Please specify a date for canceling meetings (e.g., 'today', 'tomorrow', or '10/27/2025').`,
                options: []
            };
        }
    } else if (lowerCommand.includes('schedule') || lowerCommand.includes('create') || lowerCommand.includes('set up')) {
        result.intent = 'CREATE_EVENT';
        const titleMatch = commandText.match(/(schedule|create|set up)\s+(.+?)(?:\s+for|\s+at)/i);
        const dateMatch = commandText.match(/\b(today|tomorrow|next\s+monday|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i);
        const timeMatch = commandText.match(/at\s+(\d{1,2}:\d{2}(?:\s?(?:am|pm))?)/i);
        const endTimeMatch = commandText.match(/to\s+(\d{1,2}:\d{2}(?:\s?(?:am|pm))?)/i);
        const descMatch = commandText.match(/for\s+(.+?)(?:\s+at|\s+to|$)/i);

        console.log('CREATE_EVENT matches:', { titleMatch, dateMatch, timeMatch, endTimeMatch, descMatch });

        if (titleMatch && dateMatch) {
            result.eventDetails = {
                title: titleMatch[2].trim(),
                date: resolveDate(dateMatch[1]),
                startTime: timeMatch ? convertTo24Hour(timeMatch[1]) : '09:00:00',
                endTime: endTimeMatch ? convertTo24Hour(endTimeMatch[1]) : null,
                description: descMatch ? descMatch[1].trim() : null
            };
            if (result.eventDetails.startTime && result.eventDetails.endTime && result.eventDetails.startTime >= result.eventDetails.endTime) {
                result.clarificationNeeded = {
                    message: `The time range from ${timeMatch[1]} to ${endTimeMatch[1]} is invalid. Please provide a valid time range (e.g., 'from 4:00 pm to 6:00 pm').`,
                    options: []
                };
                delete result.eventDetails;
            }
        }
    } else if (lowerCommand.includes('what') && (lowerCommand.includes('have') || lowerCommand.includes('on')) && lowerCommand.includes('calendar')) {
        result.intent = 'QUERY_EVENTS';
        const dateMatch = commandText.match(/\bfor\s+(today|tomorrow|next\s+monday|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i);

        console.log('QUERY_EVENTS matches:', { dateMatch });

        if (dateMatch) result.queryDetails = { targetDate: resolveDate(dateMatch[1]) };
    } else if (lowerCommand.includes('modify') || lowerCommand.includes('change') || lowerCommand.includes('update') || lowerCommand.includes('modified')) {
        if (!lowerCommand.includes('cancel') && !lowerCommand.includes('delete')) {
            result.intent = 'MODIFY_EVENT';
            const nameMatch = commandText.match(/(modify|change|update|modified)\s+(?:the\s+)?(.+?)(?:\s+(?:to|at|on|between|$))/i);
            const dateMatch = commandText.match(/\b(on|for)?\s*(today|tomorrow|next\s+monday|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i);
            const timeRangeMatch = commandText.match(/between\s+(\d{1,2}:\d{2}(?:\s?(?:am|pm))?)\s+(?:and|to)\s+(\d{1,2}:\d{2}(?:\s?(?:am|pm))?)/i);
            const startTimeMatch = commandText.match(/(?:to\s+start\s+at|at)\s+(\d{1,2}:\d{2}(?:\s?(?:am|pm))?)/i);
            const endTimeMatch = commandText.match(/to\s+end\s+at\s+(\d{1,2}:\d{2}(?:\s?(?:am|pm))?)/i);
            const descMatch = commandText.match(/with\s+description\s+(.+?)(?:\s+at|\s+to|$)/i);

            console.log('MODIFY_EVENT matches:', { nameMatch, dateMatch, timeRangeMatch, startTimeMatch, endTimeMatch, descMatch });

            if (nameMatch) {
                result.modifyDetails = { eventName: nameMatch[2].trim().split(' with ')[0].trim() };
                if (dateMatch) result.modifyDetails.date = resolveDate(dateMatch[2]);
                if (timeRangeMatch) {
                    result.modifyDetails.startTime = convertTo24Hour(timeRangeMatch[1]);
                    result.modifyDetails.endTime = convertTo24Hour(timeRangeMatch[2]);
                } else {
                    if (startTimeMatch) result.modifyDetails.startTime = convertTo24Hour(startTimeMatch[1]);
                    if (endTimeMatch) result.modifyDetails.endTime = convertTo24Hour(endTimeMatch[1]);
                }
                if (descMatch) result.modifyDetails.description = descMatch[1].trim();

                console.log('MODIFY_EVENT parsed details:', result.modifyDetails);

                // Validate time range
                if (result.modifyDetails.startTime && result.modifyDetails.endTime && result.modifyDetails.startTime >= result.modifyDetails.endTime) {
                    result.clarificationNeeded = {
                        message: `The time range from ${timeRangeMatch ? timeRangeMatch[1] : startTimeMatch[1]} to ${timeRangeMatch ? timeRangeMatch[2] : endTimeMatch[1]} is invalid. Please provide a valid time range (e.g., 'from 4:00 pm to 6:00 pm').`,
                        options: []
                    };
                    delete result.modifyDetails;
                }
            }
        }
    }

    console.log('parseCommandLocally output:', JSON.stringify(result, null, 2));
    return result;
}

function resolveDate(dateStr) {
    const now = new Date();
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

function convertTo24Hour(timeStr) {
    const [time, modifier] = timeStr.toLowerCase().split(/\s+/);
    let [hours, minutes] = time.split(':');
    hours = parseInt(hours, 10);
    if (modifier === 'pm' && hours !== 12) hours += 12;
    if (modifier === 'am' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${minutes.padStart(2, '0')}:00`;
}

module.exports = { parseCommand };