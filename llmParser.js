// llmParser.js

const { GoogleGenAI, Type } = require('@google/genai');

// Initialize the Gemini client using the environment variable
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); 

// Define the comprehensive JSON schema for the output
const calendarSchema = {
    type: Type.OBJECT,
    properties: {
        // The primary action the user wants to perform
        intent: {
            type: Type.STRING,
            description: "The user's intent: 'CREATE_EVENT' to schedule an event, or 'QUERY_EVENTS' to ask about the schedule.",
            enum: ['CREATE_EVENT', 'QUERY_EVENTS']
        },
        // Parameters relevant for CREATE_EVENT
        eventDetails: {
            type: Type.OBJECT,
            description: "Details required for creating a new calendar event.",
            properties: {
                title: { 
                    type: Type.STRING, 
                    description: "A concise title for the event (e.g., 'Meeting with the design team')." 
                },
                date: { 
                    type: Type.STRING, 
                    description: "The specific date of the event in YYYY-MM-DD format (e.g., 2025-10-24). Use the current date if the user refers to 'today'." 
                },
                startTime: { 
                    type: Type.STRING, 
                    description: "The starting time of the event in 24-hour format (e.g., 15:00:00). Must include seconds for Google Calendar." 
                },
                endTime: { 
                    type: Type.STRING, 
                    description: "The ending time of the event in 24-hour format (e.g., 16:00:00). If not specified, default to one hour after start." 
                },
                description: { 
                    type: Type.STRING, 
                    description: "Optional notes or description from the command (e.g., 'review the new mockups')." 
                },
                // Add more details like attendees, location, etc., if needed for a richer app
            },
            required: ['title', 'date', 'startTime']
        },
        // Parameters relevant for QUERY_EVENTS
        queryDetails: {
            type: Type.OBJECT,
            description: "Details required for querying events.",
            properties: {
                targetDate: { 
                    type: Type.STRING, 
                    description: "The specific date to query in YYYY-MM-DD format (e.g., 2025-10-23 for 'tomorrow')." 
                },
            },
            required: ['targetDate']
        }
    }
};

/**
 * Parses a natural language command using Gemini to extract intent and structured data.
 * @param {string} commandText - The user's transcribed voice command.
 * @returns {object} A structured object containing the intent and relevant details.
 */
async function parseCommand(commandText) {
    // Get the current date to resolve relative terms like "today", "tomorrow", "this Friday"
    const currentDate = new Date().toISOString().split('T')[0]; 

    // The system instruction is crucial for guiding the model to the correct output format
    const systemInstruction = `You are a strict, helpful AI assistant for calendar management. Your sole task is to analyze the user's request and output a JSON object strictly following the provided schema. The current date is ${currentDate}. Always resolve relative dates (like 'today', 'tomorrow', 'next week') into specific YYYY-MM-DD and HH:MM:SS formats based on the current date. For CREATE_EVENT, ensure 'startTime' and 'endTime' are always resolved. For QUERY_EVENTS, resolve 'targetDate'.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: commandText }] }],
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: calendarSchema,
            },
        });

        // The response.text will be a JSON string conforming to the schema
        return JSON.parse(response.text);
        
    } catch (error) {
        console.error("LLM Parsing Error:", error);
        // Fallback for failed parsing
        return { intent: 'ERROR', message: 'I could not understand that command. Please try again.' };
    }
}

module.exports = {
    parseCommand,
    // Note: We don't export the 'ai' instance, only the function that uses it
};