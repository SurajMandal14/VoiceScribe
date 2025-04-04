# VoiceScribe - Real-time Transcription & AI Assistant

VoiceScribe is a high-performance web application for real-time voice transcription with AI assistant capabilities. The application is designed to handle 100+ concurrent users through optimized backend architecture, connection management, and offline capabilities.

## Key Features

- Real-time voice transcription using WebKit Speech Recognition API
- AI assistant powered by Qwen-2.5-32b model via TeachNook API
- Push-to-talk and continuous recording modes
- Connection status monitoring and offline support
- Automatic retry logic and fallback options
- Optimized for 100+ concurrent users

## Project Structure

The project has been organized into a scalable architecture:

```
TechSnap/
├── my-app/                   # Original application (Flask-based)
│   ├── index.html            # Frontend interface
│   ├── style.css             # Styling
│   ├── script.js             # Frontend JavaScript
│   ├── server.py             # Simple Flask server
│   └── config.txt            # API key configuration
│
├── server/                   # Scalable FastAPI backend
│   ├── main.py               # FastAPI application with Redis caching
│   ├── requirements.txt      # Backend dependencies
│   └── Dockerfile            # Docker configuration for backend
│
├── kubernetes/               # Kubernetes deployment configurations
│   ├── deployment.yaml       # Pod deployments for API, web, and Redis
│   ├── service.yaml          # Services and secrets configuration
│   ├── hpa.yaml              # Horizontal Pod Autoscaler
│   └── deploy.sh             # Deployment helper script
│
├── docker-compose.yml        # Docker Compose configuration
├── nginx.conf                # Nginx configuration for web service
└── README.md                 # This documentation
```

## Quick Start (Local Development)

### Simple Setup (Flask + HTTP Server)

1. Install the required dependencies:

   ```
   cd my-app
   pip install werkzeug==2.2.3 flask==2.2.3 requests==2.28.2 flask-cors==3.0.10
   ```

2. Start the HTTP server:

   ```
   cd my-app
   python -m http.server 8000
   ```

3. Access the application at http://localhost:8000

### API Configuration

The application is now configured to connect to the TeachNook API service at:

```
https://teachnook.com/techsnap/chat/
```

The API uses Qwen-2.5-32b model for generating responses and follows standard chat completion format.

## Docker Deployment (Recommended for Production)

For the easiest deployment that can handle 100+ concurrent users:

1. Start the application stack with Docker Compose:

   ```
   docker-compose up -d
   ```

2. Access the application at `http://localhost`

## Scaling for 100+ Users

The application is designed to handle 100+ concurrent users with the following optimizations:

### Backend Optimizations

- **Async Processing**: FastAPI with async handlers for non-blocking operations
- **Connection Pooling**: Redis connection pool for efficient resource use
- **Worker Scaling**: Multiple Uvicorn workers (default: 4)
- **Rate Limiting**: Both server-side and Nginx rate limiting to prevent abuse
- **Caching**: Redis caching for AI responses with 1-hour TTL
- **Retry Logic**: Exponential backoff for API calls
- **Fallback Options**: Multiple fallback mechanisms when primary API is unavailable

### Frontend Optimizations

- **Offline Support**: Client-side caching of responses
- **Connection Monitoring**: Real-time connection status detection
- **Error Recovery**: Automatic retry with exponential backoff
- **Resource Management**: Efficient cleanup of media resources
- **Local Fallbacks**: Client-side fallback responses when server is unavailable

## Kubernetes Deployment

For large-scale deployments (500+ users), we've included Kubernetes configurations:

```
cd kubernetes
./deploy.sh
```

See the `kubernetes/README.md` file for detailed instructions.

## Production Deployment

The production version of this application is currently deployed at:

```
https://teachnook.com/techsnap/
```

## Environment Variables

| Variable       | Description               | Default    |
| -------------- | ------------------------- | ---------- |
| `GROQ_API_KEY` | Your Groq API key         | (Required) |
| `REDIS_HOST`   | Redis server hostname     | localhost  |
| `REDIS_PORT`   | Redis server port         | 6379       |
| `PORT`         | Backend API port          | 5000       |
| `WORKERS`      | Number of Uvicorn workers | 4          |

## Windows Compatibility Notes

On Windows systems:

- uvloop is not supported, so the application automatically uses the standard asyncio event loop
- For Windows development, worker count is limited to 1 by default

## Troubleshooting

### Common Issues

1. **Connection to API Failed**

   - Check if the API endpoint is accessible from your browser
   - Verify network connectivity

2. **Module Not Found Errors**

   - Make sure all dependencies are installed with the correct versions

### Performance Tuning

For better performance with more concurrent users:

- Increase the number of workers
- Adjust Redis connection pool size in main.py
- Configure proper rate limits based on your server capacity

## License

MIT

## Support

For questions or assistance, please create an issue in the GitHub repository.
