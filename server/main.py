import asyncio
import os
import time
import hashlib
import logging
from typing import Dict, Any
from fastapi import FastAPI, BackgroundTasks, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx
import redis.asyncio as redis
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
import platform

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Initialize Redis pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Setup Redis connection pool
    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = int(os.getenv("REDIS_PORT", "6379"))

    logger.info(f"Connecting to Redis at {redis_host}:{redis_port}")

    app.state.redis_pool = redis.ConnectionPool(
        host=redis_host,
        port=redis_port,
        db=0,
        max_connections=100,  # Adjust based on expected load
        decode_responses=True
    )
    yield
    # Close connections
    await app.state.redis_pool.disconnect()
    logger.info("Redis connection pool closed")

app = FastAPI(
    title="VoiceScribe API",
    description="Backend API for VoiceScribe transcription application",
    version="1.0.0",
    lifespan=lifespan
)

# Custom rate limiter middleware


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for non-API endpoints
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        client_ip = request.client.host
        redis_client = redis.Redis(
            connection_pool=request.app.state.redis_pool)

        try:
            # Get current timestamp
            current = int(time.time())
            key = f"ratelimit:{client_ip}:{current // 60}"

            # Increment counter and set expiry
            count = await redis_client.incr(key)
            if count == 1:
                await redis_client.expire(key, 60)

            # Check if rate limit exceeded (60 requests per minute)
            if count > 60:
                logger.warning(f"Rate limit exceeded for IP: {client_ip}")
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": "Rate limit exceeded. Try again in a minute."}
                )

            return await call_next(request)
        except Exception as e:
            logger.error(f"Error in rate limiter: {str(e)}")
            return await call_next(request)
        finally:
            await redis_client.close()


# Add middlewares
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Update for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    query: str

# Helper functions


def get_cache_key(query: str) -> str:
    """Create a cache key from the query"""
    return f"chat:{hashlib.md5(query.encode()).hexdigest()}"


async def call_groq_api(query: str) -> Dict[str, Any]:
    """Call Groq API with exponential backoff retry logic"""
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        logger.error("GROQ_API_KEY not configured")
        raise HTTPException(status_code=500, detail="API key not configured")

    headers = {
        "Authorization": f"Bearer {groq_api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "llama3-8b-8192",
        "messages": [{"role": "user", "content": query}],
        "temperature": 0.7,
        "max_tokens": 1024
    }

    # Retry logic
    max_retries = 3
    backoff_factor = 2
    retry_count = 0

    while retry_count < max_retries:
        try:
            timeout = httpx.Timeout(30.0, connect=10.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                logger.info(
                    f"Calling Groq API (attempt {retry_count + 1}/{max_retries + 1})")
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers=headers,
                    json=payload
                )

                if response.status_code == 200:
                    logger.info("Groq API call successful")
                    return response.json()
                elif response.status_code == 429:
                    # Rate limited, need to back off
                    retry_count += 1
                    wait_time = backoff_factor ** retry_count
                    logger.warning(
                        f"Rate limited by Groq API, retrying in {wait_time}s")
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    # Other error
                    error_text = response.text
                    logger.error(
                        f"Groq API error {response.status_code}: {error_text}")
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"Error from Groq API: {error_text}"
                    )
        except httpx.TimeoutException:
            retry_count += 1
            if retry_count >= max_retries:
                logger.error("Timeout after all retries")
                raise HTTPException(status_code=504, detail="Gateway timeout")
            wait_time = backoff_factor ** retry_count
            logger.warning(
                f"Timeout calling Groq API, retrying in {wait_time}s")
            await asyncio.sleep(wait_time)
        except Exception as e:
            logger.error(f"Error calling Groq API: {str(e)}")
            raise HTTPException(
                status_code=500, detail=f"Internal server error: {str(e)}")

    # If we get here, all retries failed
    logger.error("All Groq API retries failed")
    raise HTTPException(
        status_code=503, detail="Service unavailable after multiple retries")


@app.post("/api/chat")
async def chat(request: Request, chat_request: ChatRequest, background_tasks: BackgroundTasks):
    """Process chat requests with caching and retry logic"""
    query = chat_request.query
    cache_key = get_cache_key(query)

    # Get Redis connection from pool
    redis_client = redis.Redis(connection_pool=request.app.state.redis_pool)

    try:
        # Check cache first
        cached_response = await redis_client.get(cache_key)
        if cached_response:
            logger.info(f"Cache hit for query: {query[:30]}...")
            return {"choices": [{"message": {"content": cached_response}}]}

        # Call Groq API
        logger.info(f"Cache miss, calling Groq API for query: {query[:30]}...")
        start_time = time.time()
        data = await call_groq_api(query)
        duration = time.time() - start_time
        logger.info(f"Groq API call completed in {duration:.2f}s")

        # Cache the response asynchronously (with 1-hour expiry)
        if "choices" in data and len(data["choices"]) > 0:
            content = data["choices"][0]["message"]["content"]
            # Use background task to avoid waiting for Redis write
            background_tasks.add_task(
                redis_client.setex, cache_key, 3600, content)
            logger.info(f"Response cached with key: {cache_key}")

        return data
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        raise
    finally:
        await redis_client.close()

# Fallback responses endpoint for offline mode


@app.post("/api/fallback")
async def fallback(chat_request: ChatRequest):
    """Provide fallback responses when the main API is unavailable"""
    query = chat_request.query.lower()

    # Simple pattern matching for common queries
    if any(word in query for word in ["hello", "hi", "hey"]):
        return {"choices": [{"message": {"content": "Hello! How can I help you today?"}}]}
    elif "time" in query:
        import datetime
        current_time = datetime.datetime.now().strftime("%H:%M:%S")
        return {"choices": [{"message": {"content": f"The current time is {current_time}."}}]}
    elif "joke" in query:
        return {"choices": [{"message": {"content": "Why don't scientists trust atoms? Because they make up everything!"}}]}
    elif "thank" in query:
        return {"choices": [{"message": {"content": "You're welcome! Is there anything else I can help with?"}}]}
    else:
        return {"choices": [{"message": {"content": "I'm currently in offline mode. Some features may be limited."}}]}

# Health check endpoint


@app.get("/health")
async def health_check():
    """Check if the API is running and healthy"""
    try:
        # Check Redis connection
        redis_client = redis.Redis(connection_pool=app.state.redis_pool)
        await redis_client.ping()
        await redis_client.close()
        return {"status": "healthy", "redis": "connected"}
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"status": "unhealthy", "error": str(e)}
        )

# Root endpoint


@app.get("/")
async def root():
    """Root endpoint for the API"""
    return {
        "name": "VoiceScribe API",
        "version": "1.0.0",
        "status": "running",
        "endpoints": [
            {"path": "/api/chat", "method": "POST",
                "description": "Process chat requests"},
            {"path": "/api/fallback", "method": "POST",
                "description": "Fallback responses"},
            {"path": "/health", "method": "GET", "description": "Health check"}
        ]
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 5000))
    workers = int(os.getenv("WORKERS", 4))

    logger.info(
        f"Starting VoiceScribe API on port {port} with {workers} workers")

    # Omit uvloop and httptools on Windows
    if platform.system() == "Windows":
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=port,
            workers=1,  # Windows doesn't work well with multiple workers
        )
    else:
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=port,
            workers=workers,
            loop="uvloop",
            http="httptools",
        )
