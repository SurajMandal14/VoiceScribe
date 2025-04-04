from flask import Flask, request, jsonify
import requests
import os
import json
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Load API key from environment or config file
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

# If not found in environment, try to load from a config file
if not GROQ_API_KEY:
    try:
        with open("config.txt", "r") as f:
            GROQ_API_KEY = f.read().strip()
            print(
                f"Loaded API key from config.txt: {GROQ_API_KEY[:5]}...{GROQ_API_KEY[-5:]}")
    except Exception as e:
        print(f"Warning: Error loading API key from config.txt: {str(e)}")
        print("Please set GROQ_API_KEY environment variable or create a config.txt file.")


@app.route('/api/chat', methods=['POST'])
def chat():
    if not GROQ_API_KEY:
        print("ERROR: No API key configured")
        return jsonify({"error": "API key not configured on server"}), 500

    try:
        # Get the query from the request
        data = request.json
        query = data.get('query', '')

        print(f"Received query: {query}")

        if not query:
            print("ERROR: No query provided")
            return jsonify({"error": "No query provided"}), 400

        # Call Groq API
        print(
            f"Calling Groq API with key: {GROQ_API_KEY[:5]}...{GROQ_API_KEY[-5:]}")

        groq_request = {
            "model": "llama3-8b-8192",
            "messages": [
                {
                    "role": "system",
                    "content": "You are a helpful, concise assistant. Provide clear and accurate answers. Keep your responses relatively short."
                },
                {
                    "role": "user",
                    "content": query
                }
            ],
            "temperature": 0.7,
            "max_tokens": 1024
        }

        print(f"Request to Groq API: {json.dumps(groq_request)}")

        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {GROQ_API_KEY}"
            },
            json=groq_request
        )

        # Check for successful response
        if response.status_code != 200:
            print(f"Groq API error: {response.status_code} - {response.text}")
            return jsonify({"error": f"API error: {response.status_code} - {response.text}"}), response.status_code

        # Return the response data
        print("Successful response from Groq API")
        result = response.json()
        return jsonify(result)

    except Exception as e:
        print(f"Error in /api/chat: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route('/')
def index():
    return "Groq API Server is running. Use /api/chat endpoint for requests."


if __name__ == '__main__':
    print(
        f"Starting server with API key: {GROQ_API_KEY[:5]}...{GROQ_API_KEY[-5:] if GROQ_API_KEY else 'None'}")
    app.run(host='0.0.0.0', port=5000, debug=True)
