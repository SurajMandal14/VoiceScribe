// Configure API with retry logic and connection management
const API_CONFIG = {
  baseUrl:
    window.location.hostname === "localhost" ? "http://localhost:5000" : "", // Empty string for relative URLs in production
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 30000,
  fallbackEnabled: true,
};

// Connection status tracking
let isServerConnected = true;
let lastServerCheck = 0;
const SERVER_CHECK_INTERVAL = 30000; // 30 seconds

// Add connection status indicator to the UI
function addConnectionStatusIndicator() {
  // Create status indicator element if it doesn't exist
  if (!document.getElementById("connectionStatus")) {
    const statusIndicator = document.createElement("div");
    statusIndicator.id = "connectionStatus";
    statusIndicator.className = "connection-status online";
    statusIndicator.innerHTML =
      '<i class="fas fa-wifi"></i> <span>Online</span>';
    document.querySelector(".app-header").appendChild(statusIndicator);

    // Add CSS for the indicator
    const style = document.createElement("style");
    style.textContent = `
      .connection-status {
        position: absolute;
        top: 1rem;
        left: 1rem;
        padding: 5px 10px;
        border-radius: 20px;
        font-size: 0.8rem;
        display: flex;
        align-items: center;
        gap: 5px;
        transition: all 0.3s ease;
        z-index: 10;
      }
      .connection-status.online {
        background-color: rgba(16, 185, 129, 0.2);
        color: var(--success);
      }
      .connection-status.offline {
        background-color: rgba(239, 68, 68, 0.2);
        color: var(--error);
      }
    `;
    document.head.appendChild(style);
  }

  // Update connection status
  updateConnectionStatus();
}

// Check and update connection status
async function updateConnectionStatus() {
  const statusIndicator = document.getElementById("connectionStatus");
  if (!statusIndicator) return;

  const isOnline = navigator.onLine;
  const currentTime = Date.now();

  // Update online/offline status based on browser's navigator
  if (!isOnline) {
    statusIndicator.className = "connection-status offline";
    statusIndicator.innerHTML =
      '<i class="fas fa-wifi-slash"></i> <span>Offline</span>';
    isServerConnected = false;
    return;
  }

  // Only check server connection if we're online and it's been a while since last check
  if (isOnline && currentTime - lastServerCheck > SERVER_CHECK_INTERVAL) {
    lastServerCheck = currentTime;

    try {
      // Try to fetch the health endpoint with a timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${API_CONFIG.baseUrl}/health`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        statusIndicator.className = "connection-status online";
        statusIndicator.innerHTML =
          '<i class="fas fa-wifi"></i> <span>Online</span>';
        isServerConnected = true;

        // Clear any connection error messages
        if (errorMessage.innerHTML.includes("network connection")) {
          errorMessage.innerHTML = "";
        }
      } else {
        statusIndicator.className = "connection-status offline";
        statusIndicator.innerHTML =
          '<i class="fas fa-server"></i> <span>Server Error</span>';
        isServerConnected = false;
      }
    } catch (error) {
      // Server is likely down
      statusIndicator.className = "connection-status offline";
      statusIndicator.innerHTML =
        '<i class="fas fa-server"></i> <span>Server Unavailable</span>';
      isServerConnected = false;

      console.warn("Server check failed:", error);
    }
  }
}

// Enhanced API call function with retry logic and offline mode support
async function callAPI(endpoint, data, useCache = true) {
  // Check connection status and update it
  await updateConnectionStatus();

  let retries = 0;
  let lastError;
  const cacheKey = `api_cache:${endpoint}:${JSON.stringify(data)}`;

  // Try to get from local cache first if we're offline and cache is enabled
  if (!isServerConnected && useCache) {
    const cachedResponse = localStorage.getItem(cacheKey);
    if (cachedResponse) {
      try {
        return JSON.parse(cachedResponse);
      } catch (e) {
        console.error("Error parsing cached response:", e);
      }
    }
  }

  // Try API call with retries
  while (retries <= API_CONFIG.maxRetries) {
    try {
      // Calculate exponential backoff delay
      const delay =
        retries > 0
          ? Math.min(API_CONFIG.retryDelay * Math.pow(2, retries - 1), 10000)
          : 0;
      if (delay > 0) {
        console.log(`Retrying after ${delay}ms (attempt ${retries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      // Create API request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        API_CONFIG.timeout
      );

      const response = await fetch(`${API_CONFIG.baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API error:", response.status, errorText);

        // If rate limited, retry after backoff
        if (response.status === 429) {
          retries++;
          lastError = new Error(
            `Rate limited, retrying (${retries}/${API_CONFIG.maxRetries})`
          );
          continue;
        }

        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Cache successful responses for offline use
      if (useCache) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (e) {
          // Handle storage quota exceeded or other storage errors
          console.warn("Failed to cache response:", e);
        }
      }

      return data;
    } catch (error) {
      console.error(
        `API call error (attempt ${retries + 1}/${API_CONFIG.maxRetries + 1}):`,
        error
      );
      lastError = error;

      // Don't retry on abort (timeout)
      if (error.name === "AbortError") {
        break;
      }

      retries++;

      // If this was our last retry, fall through to the error handler
      if (retries > API_CONFIG.maxRetries) {
        break;
      }
    }
  }

  // All retries failed or timeout occurred
  throw lastError || new Error("API call failed after multiple retries");
}

// Updated processGroqQuery function to use the enhanced API calling
async function processGroqQuery(query) {
  if (!query.trim() || !assistantEnabled) return;

  console.log("Processing query:", query);

  // Show AI thinking indicator
  aiThinking.style.display = "flex";

  try {
    // First try the main API endpoint
    const data = await callAPI("/api/chat", { query });

    if (data.choices && data.choices.length > 0) {
      const aiResponse = data.choices[0].message.content.trim();
      console.log("AI response:", aiResponse);

      // Speak the response
      speakText(aiResponse);
    } else {
      console.error("No choices in API response");
      throw new Error("No response content received from API");
    }
  } catch (error) {
    console.error("Error calling API:", error);
    errorMessage.innerHTML = `<i class="fas fa-exclamation-triangle"></i> AI Error: ${error.message}`;

    // Try fallback API if enabled
    if (API_CONFIG.fallbackEnabled) {
      try {
        console.log("Attempting fallback API");
        const fallbackData = await callAPI("/api/fallback", { query }, false);

        if (fallbackData.choices && fallbackData.choices.length > 0) {
          const fallbackResponse =
            fallbackData.choices[0].message.content.trim();
          console.log("Fallback response:", fallbackResponse);
          speakText(fallbackResponse);
          return;
        }
      } catch (fallbackError) {
        console.error("Fallback API failed:", fallbackError);
      }
    }

    // Last resort: use client-side fallback
    console.log("Using client-side fallback response");
    const fallbackResponse = generateResponse(query);
    if (fallbackResponse) {
      console.log("Client-side fallback response:", fallbackResponse);
      speakText(fallbackResponse);
    }
  } finally {
    // Hide AI thinking indicator
    aiThinking.style.display = "none";
  }
}

// Initialize connection monitoring and periodic status updates
function initConnectionMonitoring() {
  // Add connection status indicator
  addConnectionStatusIndicator();

  // Listen for online/offline events
  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);

  // Set up periodic connection checking
  setInterval(updateConnectionStatus, SERVER_CHECK_INTERVAL);

  // Initial status check
  updateConnectionStatus();
}

// Event Listeners
window.onload = function () {
  console.log("Page loaded, initializing app...");
  listeningStatus.style.opacity = 0;
  processingStatus.style.opacity = 0;

  // Initialize connection monitoring
  initConnectionMonitoring();

  // Show fallback animations instead of missing GIFs
  document.getElementById("listeningGif").onerror = function () {
    this.style.display = "none";
    this.previousElementSibling.style.display = "flex";
  };

  document.getElementById("processingGif").onerror = function () {
    this.style.display = "none";
    this.previousElementSibling.style.display = "flex";
  };

  // Initialize audio device list
  getAudioDevices();

  // Apply saved theme
  applyTheme();

  // Apply saved transcription box expansion
  applyTranscriptionExpansion();

  // Initialize speech synthesis
  if (typeof speechSynthesis !== "undefined") {
    speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  } else {
    console.error("Speech synthesis not supported");
    assistantToggle.disabled = true;
    assistantToggle.checked = false;
    assistantEnabled = false;
  }

  // Set the assistant toggle based on saved preference
  assistantToggle.checked = assistantEnabled;

  // Initialize mode toggle
  initModeToggle();

  // Initialize push to talk
  initPushToTalk();

  // Add event listener for start button
  startBtn.addEventListener("click", startRecording);

  // Add event listener for stop button
  stopBtn.addEventListener("click", stopRecording);

  // Add event listener for save button
  saveBtn.addEventListener("click", () => saveTranscriptionToFile());

  // Add event listener for device selection
  audioDevices.addEventListener("change", function () {
    selectedDeviceId = this.value;
    localStorage.setItem("selectedDeviceId", selectedDeviceId);
    console.log("Selected device:", selectedDeviceId);

    // Restart recording if active
    if (mediaRecorder && mediaRecorder.state === "recording") {
      stopRecording();
      setTimeout(startRecording, 500); // Short delay to ensure clean switch
    }
  });

  // Add event listener for refresh devices button
  refreshDevices.addEventListener("click", getAudioDevices);

  // Add event listener for theme toggle
  themeToggleBtn.addEventListener("click", function () {
    isDarkMode = !isDarkMode;
    localStorage.setItem("darkMode", isDarkMode ? "enabled" : "disabled");
    applyTheme();
  });

  // Add event listener for expand button
  expandBtn.addEventListener("click", function () {
    const isExpanded = transcriptionSection.classList.toggle(
      "transcription-expanded"
    );
    localStorage.setItem("isExpanded", isExpanded.toString());

    this.innerHTML = isExpanded
      ? '<i class="fas fa-compress-alt"></i>'
      : '<i class="fas fa-expand-alt"></i>';
  });

  // Add event listener for assistant toggle
  assistantToggle.addEventListener("change", function () {
    assistantEnabled = this.checked;
    localStorage.setItem(
      "assistantEnabled",
      assistantEnabled ? "enabled" : "disabled"
    );
    console.log("Assistant " + (assistantEnabled ? "enabled" : "disabled"));
  });

  // Add event listener for voice selection
  voiceSelect.addEventListener("change", function () {
    selectedVoice = this.value;
    localStorage.setItem("selectedVoice", selectedVoice);
    console.log("Voice selected:", selectedVoice);

    // Test the selected voice
    if (assistantEnabled) {
      speakText("Hello, I'm your voice assistant.");
    }
  });

  // Add event listener for API key management
  apiKeyBtn.addEventListener("click", manageApiKey);

  // Add event listener for stop speaking button
  stopSpeakingBtn.addEventListener("click", stopSpeaking);

  // Initialize API key status
  updateApiKeyStatus();

  initSpeechRecognition();
  loadHistory(); // Load transcription history
  console.log("History loaded, items:", transcriptionHistory.length);

  // Initialize counts
  updateCounts();
};

// Remove the duplicate event listener that was added before
window.removeEventListener("DOMContentLoaded", function () {
  initConnectionMonitoring();
});
