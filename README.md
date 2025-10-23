# Calendar Voice Bot

A voice-activated calendar management application that integrates with Google Calendar, allowing users to schedule, query, and modify events using natural language commands. Built with Node.js, Express, and speech recognition, this bot leverages the Google Calendar API and an LLM (via Gemini) for parsing commands. Users can also type commands as an alternative to voice input.

## Features
- Authentication: Connects to Google Calendar using OAuth 2.0.
- Voice Commands: Schedule, query, and modify events using voice input (e.g., "Schedule a meeting tomorrow at 3 PM", "Modify the team meeting to start at 4 PM").
- Natural Language Processing: Handles variations in meeting names (e.g., "Product call" matches "Product call with Sharan") and prompts for clarification if multiple events match.
- Real-Time Feedback: Provides visual and spoken responses via the browser interface.
- Cross-Browser Support: Optimized for Chrome and Edge with Web Speech API.

## Prerequisites
- Node.js (v16 or later)
- npm (comes with Node.js)
- Google Cloud Project with:
  - Enabled Google Calendar API
  - OAuth 2.0 credentials (Client ID, Client Secret)
- Environment variables configured (see .env setup below)

## Installation

### 1. Clone the Repository
git clone <repository-url>
cd calendar-voice-bot

### 2. Install Dependencies
npm install

### 3. Set Up Environment Variables
Create a .env file in the root directory with the following variables:
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:9000/oauth2callback
GEMINI_API_KEY=your-gemini-api-key
PORT=9000
- Obtain GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from the Google Cloud Console after setting up OAuth 2.0 credentials.
- Get GEMINI_API_KEY from the Google AI Studio or your Gemini API provider.
- GOOGLE_REDIRECT_URI should match the callback URL used in Google Cloud Console (e.g., http://localhost:9000/oauth2callback).

### 4. Directory Structure
Ensure the following structure:
```text
calendar-voice-bot/
├── frontend/
│   ├── index.html
│   ├── app.js
├── calendarService.js
├── index.js
├── llmParser.js
└── .env
```

## Usage

### 1. Start the Server
node index.js
The server will run on http://localhost:9000 (or the port specified in .env).

### 2. Access the Application
Open your browser (preferably Chrome or Edge) and navigate to http://localhost:9000. You should see the "Calendar Voice Bot" interface.

### 3. Authentication
- Click "Connect Calendar" to authenticate with Google.
- Follow the OAuth flow to grant permissions.
- After successful authentication, the mic button will be enabled.

### 4. Commands
- Voice Commands: Click the mic button and speak one of the following:
  - "Schedule a meeting with the team tomorrow at 3 PM"
  - "What’s on my calendar for today?"
  - "Modify the product call tomorrow to start at 4 PM" (if multiple matches, say "modify event with ID [ID]" when prompted)

### 5. Feedback
- The status and response areas will update with the bot's output.
- Spoken feedback is provided via text-to-speech for voice commands.

## Development

### Running Locally
- Ensure all dependencies are installed and environment variables are set.
- Use node index.js to start the server.
- Open http://localhost:9000 to test changes.

### Adding New Features
- Modify llmParser.js to enhance natural language parsing.
- Update calendarService.js for new calendar operations.
- Adjust app.js or frontend/index.html for frontend interactions.
- Test thoroughly with various voice commands.

### Troubleshooting
- "Cannot GET /": Ensure index.html and app.js are in the /frontend directory and the server is configured correctly in index.js.
- Authentication Issues: Verify .env variables and Google OAuth setup.
- Speech Recognition Errors: Use Chrome or Edge, and ensure microphone permissions are granted.
- Check the browser console (F12) and server logs for detailed errors.

## Dependencies
- express: Web server framework
- googleapis: Google API client library
- @google/genai: Gemini AI library for natural language processing
- dotenv: Environment variable management

Install via npm install.

## Contributing
1. Fork the repository.
2. Create a feature branch (git checkout -b feature-name).
3. Commit changes (git commit -m "Add feature-name").
4. Push to the branch (git push origin feature-name).
5. Open a pull request.

## Acknowledgments
- Google Cloud for API services.
- Gemini AI for natural language processing.
- The Web Speech API for voice recognition.

## Contact
For questions or support, please open an issue on the repository or contact the maintainer.
