# VoiceScribe - Transcription App with AI Assistant

This is a web application that provides real-time voice transcription with an AI assistant powered by Groq's LLama3 model.

## Features

- Real-time voice transcription in any language
- Two operation modes:
  - **Continuous Recording** - For transcription only
  - **Push-to-Talk** - For transcription with AI assistant responses
- Voice synthesis for AI responses with customizable voices
- Text cleanup to prevent repeated phrases and words
- Dark/Light mode toggle
- Transcription history with save/load functionality
- Microphone selection
- Stop speaking button to interrupt AI responses

## Setup Instructions

### 1. API Key Configuration

This app uses the Groq API for AI responses. You need to set up your API key in the backend:

1. Get a Groq API key from [https://console.groq.com/keys](https://console.groq.com/keys)
2. Open the `config.txt` file in the `my-app` directory
3. Replace the existing text with your actual Groq API key
4. Save the file

Alternatively, you can set the API key as an environment variable named `GROQ_API_KEY`.

### 2. Install Backend Dependencies

```bash
cd my-app
pip install -r requirements.txt
```

### 3. Start the Backend Server

```bash
cd my-app
python server.py
```

The backend server will run on http://localhost:5000.

### 4. Serve the Frontend

You can use any static file server to serve the frontend. For example:

```bash
# Using Python's built-in HTTP server
cd my-app
python -m http.server 8000
```

Then open your browser to http://localhost:8000/p1.html

## How to Use

1. **Select a Mode**:

   - **Continuous Recording**: For long transcription sessions without AI interaction
   - **Push-to-Talk**: Hold the microphone button while speaking and release to get an AI response

2. **AI Assistant**:

   - Only available in Push-to-Talk mode
   - Select your preferred voice from the dropdown
   - Press and hold the microphone button to speak, release when done
   - Click the "Stop Speaking" button if you want to interrupt the AI's response

3. **Transcription Actions**:
   - Save transcriptions as text files
   - View past transcriptions in the history panel
   - Expand the transcription area for better visibility

## Deployment to Other Devices

When deploying to other devices:

1. Make sure the backend server is accessible from the device (either on the same network or exposed via internet)
2. Update the `API_BASE_URL` in `p1.html` to point to your server's address and port
3. Ensure the API key is configured on the server, not on the client device

For production deployment, consider:

- Using HTTPS for both backend and frontend
- Setting up proper CORS policies on the server
- Using environment variables for API keys instead of config files
- Adding authentication for the backend API

## Troubleshooting

- **Error connecting to backend**: Check that the backend server is running and the `API_BASE_URL` is correct
- **API errors**: Verify your Groq API key is valid and has not expired
- **Microphone not working**: Make sure you've granted microphone permissions in your browser
- **No AI response**: Remember that AI responses are only available in Push-to-Talk mode

## License

This project is open source and available under the MIT License.
