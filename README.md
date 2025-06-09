# VoiceScribe: AI-Powered Voice Transcription

VoiceScribe is a real-time voice transcription application that uses AI to convert spoken words into text with high accuracy. It features a modern user interface, efficient backend processing, and is designed to handle 100+ concurrent users.

## Features

- Real-time voice recording and transcription
- Multi-provider AI routing for reliable service
- Support for multiple languages
- Text export capabilities
- Responsive design for all devices
- Scalable architecture with FastAPI, Redis, Docker, and Kubernetes

## Architecture

The application is built using a modern stack:

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: FastAPI (Python)
- **Caching**: Redis
- **Containerization**: Docker
- **Orchestration**: Kubernetes
- **Reverse Proxy**: Nginx

## Multi-Provider AI Router

VoiceScribe includes a robust multi-provider AI routing system that intelligently routes requests across different AI providers with built-in fallback chains:

### AI Router Features

- **Provider Abstraction**: Unified API for multiple AI providers
- **Smart Routing**: Automatically selects the best available provider
- **Fallback Chains**: If one provider fails, automatically try others
- **Quota Tracking**: Monitors usage to stay within free tier limits
- **Secure Key Management**: API keys are stored securely with rotation capabilities
- **Monitoring**: Track usage, success rates, and errors for each provider

### Supported Providers

The system currently supports the following AI providers:

1. **Groq**: Primary provider, uses `llama3-8b-8192` model
2. **Google**: Secondary provider, uses `gemini-1.5-pro` model
3. **OpenAI**: Tertiary (paid) provider, uses `gpt-3.5-turbo` model

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Kubernetes cluster (for production deployment)
- API keys for at least one of the supported providers (Groq, Google, OpenAI)

### Local Development

1. Clone the repository:

   ```
   git clone https://github.com/yourusername/voicescribe.git
   cd voicescribe
   ```

2. Set up environment variables:

   ```
   # Create a .env file
   cp .env.example .env

   # Add your API keys
   echo "GROQ_API_KEY=your_groq_api_key" >> .env
   echo "GOOGLE_API_KEY=your_google_api_key" >> .env
   echo "OPENAI_API_KEY=your_openai_api_key" >> .env
   ```

3. Start the application:

   **To run the backend:**

   ```
   cd server
   python -m uvicorn main:app --host 0.0.0.0 --port 5000
   ```

   **To run the frontend:**

   ```
   cd my-app
   python -m http.server 8080
   ```

4. Access the application at `http://localhost:8080`

   **API Debug Endpoints:**

   - To see all models: `http://localhost:5000/api/debug/models`
   - To see which model was used last: `http://localhost:5000/api/debug/last_model`

### Kubernetes Deployment

For production deployment with Kubernetes:

1. Apply the Kubernetes configurations:

   ```
   kubectl apply -f kubernetes/
   ```

2. Set up secrets for API keys:

   ```
   kubectl create secret generic ai-api-keys \
     --from-literal=GROQ_API_KEY=your_groq_api_key \
     --from-literal=GOOGLE_API_KEY=your_google_api_key
   ```

3. Access the service using the LoadBalancer IP or Ingress hostname

## AI Router Dashboard

The application includes a monitoring dashboard for the AI Router:

```
http://localhost:8080/api/ai/dashboard
```

The dashboard allows you to:

- View the status of all providers
- Monitor usage statistics
- Reset usage counters
- Add or rotate API keys

## API Documentation

API documentation is available at:

```
http://localhost:8080/docs
```

Key endpoints:

- `/api/chat`: Main chat API that uses the AI router
- `/api/ai/generate`: Direct access to the AI router
- `/api/ai/status`: Get provider status
- `/api/ai/stats`: Get usage statistics
- `/api/ai/keys`: Manage API keys

## License

This project is licensed under the MIT License - see the LICENSE file for details.
