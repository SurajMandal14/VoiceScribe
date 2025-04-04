//const API_BASE_URL = 'http://localhost:5000';

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const saveBtn = document.getElementById("saveBtn");
const historyBtn = document.getElementById("historyBtn");
const historyModal = document.getElementById("historyModal");
const closeModal = document.getElementById("closeModal");
const historyList = document.getElementById("historyList");
const emptyHistory = document.getElementById("emptyHistory");
const transcriptionText = document.getElementById("transcriptionText");
const errorMessage = document.getElementById("errorMessage");
const listeningStatus = document.getElementById("listeningStatus");
const processingStatus = document.getElementById("processingStatus");
const audioDevices = document.getElementById("audioDevices");
const refreshDevices = document.getElementById("refreshDevices");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const expandBtn = document.getElementById("expandBtn");
const transcriptionSection = document.getElementById("transcriptionSection");
const wordCount = document.getElementById("wordCount");
const charCount = document.getElementById("charCount");
const audioVisualization = document.getElementById("audioVisualization");
const audioBars = document.getElementById("audioBars");
const assistantToggle = document.getElementById("assistantToggle");
const voiceSelect = document.getElementById("voiceSelect");

// New UI elements for push-to-talk and mode toggle
const continuousModeBtn = document.getElementById("continuousModeBtn");
const pushToTalkBtn = document.getElementById("pushToTalkBtn");
const pttButton = document.getElementById("pttButton");
const pushToTalkContainer = document.getElementById("pushToTalkContainer");
const continuousControls = document.getElementById("continuousControls");
const aiThinking = document.getElementById("aiThinking");

// API Key management elements
const apiKeyBtn = document.getElementById("apiKeyBtn");
const apiKeyStatus = document.getElementById("apiKeyStatus");

// Stop speaking button
const stopSpeakingBtn = document.getElementById("stopSpeakingBtn");
const stopSpeakingContainer = document.getElementById("stopSpeakingContainer");

let mediaRecorder;
let audioChunks = [];
let recognition;
let fullTranscription = [];
let lastProcessingTime = 0;
let processingTimeout = null;
let isProcessing = false;
let minProcessingInterval = 1500; // Minimum time (ms) between showing processing animations
let transcriptionHistory = [];
let selectedDeviceId = "";
let audioContext;
let audioAnalyser;
let audioDataArray;
let audioLevelCheckInterval;
let lastAudioActivity = 0;
let lowVolumeTimeout = null;
let visualizationInterval = null;
let isDarkMode = localStorage.getItem("darkMode") === "enabled";
let assistantEnabled = localStorage.getItem("assistantEnabled") !== "disabled";
let lastQuestion = "";
let isResponding = false;
let speechSynthesis = window.speechSynthesis;
let voices = [];
let selectedVoice = localStorage.getItem("selectedVoice") || "";

// New variables for push to talk and Groq API
let isPushToTalkMode = localStorage.getItem("isPushToTalkMode") === "true";
let isPttActive = false;
let pttStream = null;
let pttMediaRecorder = null;
let pttAudioChunks = [];
let pttTranscript = "";

// Backend API URL - change this to your server address when deploying
// Use a relative URL that works regardless of where the app is hosted
const API_BASE_URL = "http://localhost:5000";
const GROQ_MODEL = "llama3-8b-8192";

// Initialize mode toggle buttons
function initModeToggle() {
  // Set initial state based on saved preference
  if (isPushToTalkMode) {
    pushToTalkBtn.classList.add("active");
    continuousModeBtn.classList.remove("active");
    pushToTalkContainer.style.display = "flex";
    continuousControls.style.display = "none";
  } else {
    continuousModeBtn.classList.add("active");
    pushToTalkBtn.classList.remove("active");
    pushToTalkContainer.style.display = "none";
    continuousControls.style.display = "flex";

    // Set a message to inform users that AI responses are only in push-to-talk mode
    errorMessage.innerHTML = `<i class="fas fa-info-circle"></i> AI responses are only available in Push-to-Talk mode`;
    errorMessage.style.backgroundColor = "rgba(99, 102, 241, 0.1)";
    errorMessage.style.color = "var(--primary)";
    setTimeout(() => {
      errorMessage.innerHTML = "";
      errorMessage.style.backgroundColor = "";
      errorMessage.style.color = "";
    }, 5000);
  }

  // Add event listeners for mode toggle
  continuousModeBtn.addEventListener("click", () => {
    if (!isPushToTalkMode) return;

    isPushToTalkMode = false;
    localStorage.setItem("isPushToTalkMode", "false");

    // Update UI
    pushToTalkBtn.classList.remove("active");
    continuousModeBtn.classList.add("active");
    pushToTalkContainer.style.display = "none";
    continuousControls.style.display = "flex";

    // Show message that AI responses are only in push-to-talk mode
    errorMessage.innerHTML = `<i class="fas fa-info-circle"></i> AI responses are only available in Push-to-Talk mode`;
    errorMessage.style.backgroundColor = "rgba(99, 102, 241, 0.1)";
    errorMessage.style.color = "var(--primary)";
    setTimeout(() => {
      errorMessage.innerHTML = "";
      errorMessage.style.backgroundColor = "";
      errorMessage.style.color = "";
    }, 5000);

    // Stop any ongoing PTT recording
    stopPTTRecording();
  });

  pushToTalkBtn.addEventListener("click", () => {
    if (isPushToTalkMode) return;

    isPushToTalkMode = true;
    localStorage.setItem("isPushToTalkMode", "true");

    // Update UI
    continuousModeBtn.classList.remove("active");
    pushToTalkBtn.classList.add("active");
    continuousControls.style.display = "none";
    pushToTalkContainer.style.display = "flex";

    // Stop any ongoing continuous recording
    if (mediaRecorder && mediaRecorder.state === "recording") {
      stopBtn.click();
    }
  });
}

// Initialize push to talk functionality
function initPushToTalk() {
  // Setup Push to Talk button events
  pttButton.addEventListener("mousedown", startPTTRecording);
  pttButton.addEventListener("touchstart", startPTTRecording);

  pttButton.addEventListener("mouseup", stopPTTRecording);
  pttButton.addEventListener("mouseleave", stopPTTRecording);
  pttButton.addEventListener("touchend", stopPTTRecording);
  pttButton.addEventListener("touchcancel", stopPTTRecording);
}

// Start PTT recording
async function startPTTRecording(event) {
  if (event.type === "touchstart") {
    // Prevent scrolling when using touch
    event.preventDefault();
  }

  if (isPttActive) return;
  isPttActive = true;

  try {
    // Update UI
    pttButton.parentElement.classList.add("push-to-talk-active");
    pttButton.querySelector("i").className = "fas fa-microphone-alt";

    // Clear previous transcript
    pttTranscript = "";
    pttAudioChunks = [];

    // IMPORTANT: Reset the last question to ensure we get a new response each time
    lastQuestion = "";

    // Get audio stream
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };

    if (selectedDeviceId) {
      audioConstraints.deviceId = { exact: selectedDeviceId };
    }

    pttStream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
    });

    // Setup media recorder
    pttMediaRecorder = new MediaRecorder(pttStream);
    pttMediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        pttAudioChunks.push(event.data);
      }
    };

    // Setup recognition
    if (!recognition) {
      initSpeechRecognition();
    }

    recognition.continuous = false; // For PTT, we want single utterances
    recognition.interimResults = true;

    // Override handlers for PTT mode
    recognition.onresult = handlePTTResult;
    recognition.onend = () => {
      console.log("PTT recognition ended");
    };

    // Start recording
    pttMediaRecorder.start();

    // Start recognition after a brief delay to ensure it's ready
    setTimeout(() => {
      try {
        recognition.start();
        console.log("PTT recording started");
      } catch (e) {
        console.error("Error starting PTT recognition:", e);
      }
    }, 100);
  } catch (error) {
    console.error("Error starting PTT recording:", error);
    errorMessage.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Error: ${error.message}`;
    isPttActive = false;
  }
}

// Handle PTT speech recognition results
function handlePTTResult(event) {
  let transcript = "";

  // Get the most confident result
  for (let i = 0; i < event.results.length; i++) {
    transcript += event.results[i][0].transcript;
  }

  // Clean transcript to remove repetitions
  const cleanedTranscript = cleanRepeatedPhrases(transcript.trim());

  // Save cleaned transcript
  pttTranscript = cleanedTranscript;

  // Update display
  transcriptionText.innerHTML = pttTranscript;
  updateCounts();

  // Log transcript for debugging
  console.log("PTT partial transcript:", pttTranscript);
}

// Stop PTT recording and send to Groq API
function stopPTTRecording() {
  if (!isPttActive) return;
  isPttActive = false;

  // Update UI
  pttButton.parentElement.classList.remove("push-to-talk-active");
  pttButton.querySelector("i").className = "fas fa-microphone";

  // Add a slight delay to ensure we get the final transcription
  setTimeout(() => {
    // Stop recording
    if (pttMediaRecorder && pttMediaRecorder.state === "recording") {
      pttMediaRecorder.stop();
    }

    if (recognition) {
      try {
        // Get the final transcript before stopping
        recognition.stop();
      } catch (e) {
        console.log("Error stopping recognition:", e);
      }
    }

    // Stop audio stream tracks
    if (pttStream) {
      pttStream.getTracks().forEach((track) => track.stop());
      pttStream = null;
    }

    // If we have a transcript, process it with Groq API
    if (pttTranscript) {
      console.log("PTT final transcript:", pttTranscript);

      // Add to transcription history
      fullTranscription.push(pttTranscript);

      // Save the current transcript before processing
      const currentTranscript = pttTranscript;

      // Process with Groq API
      if (assistantEnabled) {
        processGroqQuery(currentTranscript);
      }

      // Reset transcript for next time
      pttTranscript = "";
    } else {
      console.log("No transcript received from PTT");
      errorMessage.innerHTML = `<i class="fas fa-exclamation-triangle"></i> No speech detected. Please try again.`;
      setTimeout(() => {
        errorMessage.innerHTML = "";
      }, 3000);
    }
  }, 500); // Add a 500ms delay to ensure recognition completes
}

// Process query with Groq API via our backend server
async function processGroqQuery(query) {
  if (!query.trim() || !assistantEnabled) return;

  console.log("Processing query with backend server:", query);

  // Show AI thinking indicator
  aiThinking.style.display = "flex";

  try {
    console.log("Sending request to backend server");
    // Create backend server request
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: query,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Backend server error:", response.status, errorText);
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log("Backend server response data:", data);

    if (data.choices && data.choices.length > 0) {
      const aiResponse = data.choices[0].message.content.trim();
      console.log("Groq API response text:", aiResponse);

      // Speak the response
      speakText(aiResponse);
    } else {
      console.error("No choices in API response");
      throw new Error("No response content received from API");
    }
  } catch (error) {
    console.error("Error calling backend server:", error);
    errorMessage.innerHTML = `<i class="fas fa-exclamation-triangle"></i> AI Error: ${error.message}`;

    // Fallback to simpler responses for common queries
    console.log("Attempting fallback response");
    const fallbackResponse = generateResponse(query);
    if (fallbackResponse) {
      console.log("Using fallback response:", fallbackResponse);
      speakText(fallbackResponse);
    }
  } finally {
    // Hide AI thinking indicator
    aiThinking.style.display = "none";
  }
}

// Speak text using the selected voice
function speakText(text) {
  if (!assistantEnabled || !text) {
    console.log("Speech not enabled or no text to speak");
    return;
  }

  console.log("Speaking text:", text);

  try {
    // Show stop speaking button
    stopSpeakingContainer.style.display = "block";

    // Cancel any ongoing speech
    if (speechSynthesis.speaking) {
      console.log("Canceling ongoing speech");
      speechSynthesis.cancel();
      // Wait a moment to ensure cancellation completes
      setTimeout(() => doSpeak(text), 100);
    } else {
      doSpeak(text);
    }
  } catch (e) {
    console.error("Error in speakText:", e);
    // Still try to append the response even if speaking fails
    appendAssistantResponse(text);
  }

  function doSpeak(textToSpeak) {
    try {
      // Create utterance
      const utterance = new SpeechSynthesisUtterance(textToSpeak);

      // Set voice if selected
      if (selectedVoice) {
        const voice = voices.find((v) => v.name === selectedVoice);
        if (voice) {
          utterance.voice = voice;
          console.log("Using voice:", voice.name);
        } else {
          console.log("Selected voice not found, using default");
        }
      }

      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Add speech ended event
      utterance.onend = () => {
        isResponding = false;
        console.log("Speech synthesis finished");
        stopSpeakingContainer.style.display = "none";
      };

      utterance.onerror = (e) => {
        isResponding = false;
        console.error("Speech synthesis error:", e);
        stopSpeakingContainer.style.display = "none";
      };

      // Add the assistant response to the transcription
      console.log("Appending assistant response to transcription");
      appendAssistantResponse(textToSpeak);

      // Mark as responding
      isResponding = true;

      // Speak the text
      speechSynthesis.speak(utterance);
    } catch (e) {
      console.error("Error in doSpeak:", e);
      // Still try to append the response even if speaking fails
      appendAssistantResponse(textToSpeak);
    }
  }
}

// Append assistant response to transcription area
function appendAssistantResponse(text) {
  // Create a response element
  const responseDiv = document.createElement("div");
  responseDiv.className = "assistant-response";
  responseDiv.textContent = text;

  // Add it to the transcription area
  transcriptionText.appendChild(document.createElement("br"));
  transcriptionText.appendChild(responseDiv);
  transcriptionText.appendChild(document.createElement("br"));

  // Update counts
  updateCounts();
}

// Process the transcription to find questions and respond
function processForQuestions(text) {
  if (!assistantEnabled) return;

  // Split by punctuation to find sentences
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  // Check the last sentence
  if (sentences.length > 0) {
    const lastSentence = sentences[sentences.length - 1].trim();

    // Check if it's a question or a command and not the same as the last question we processed
    if (
      (isQuestion(lastSentence) || isCommand(lastSentence)) &&
      lastSentence.toLowerCase() !== lastQuestion.toLowerCase()
    ) {
      console.log("Question/Command detected:", lastSentence);
      lastQuestion = lastSentence;

      // Generate and speak a response
      const response = generateResponse(lastSentence);
      console.log("Response:", response);
      speakText(response);
    }
  }
}

// Check for commands as well as questions
function isCommand(text) {
  if (!text.trim()) return false;

  const commandWords = [
    "sing",
    "play",
    "tell",
    "show",
    "open",
    "start",
    "stop",
    "pause",
    "resume",
    "give",
    "find",
    "search",
    "calculate",
  ];

  const lowercaseText = text.toLowerCase();

  // Check if text starts with a command word
  return commandWords.some((cmd) => lowercaseText.startsWith(cmd));
}

// Simple AI response generator
function generateResponse(question) {
  // Strip punctuation and convert to lowercase for comparison
  const cleanQuestion = question.replace(/[^\w\s]/g, "").toLowerCase();

  // Define some basic patterns and responses
  const responses = [
    {
      patterns: ["hello", "hi", "hey", "greetings"],
      responses: [
        "Hello! How can I help you today?",
        "Hi there! What can I assist you with?",
        "Hey! I'm here to help.",
      ],
    },
    {
      patterns: ["how are you", "how're you", "how you doing"],
      responses: [
        "I'm doing well, thank you for asking! How about you?",
        "I'm functioning perfectly! How can I assist you?",
        "All systems operational! How can I help?",
      ],
    },
    {
      patterns: ["what is your name", "who are you", "your name"],
      responses: [
        "I'm VoiceScribe's AI assistant. I'm here to help answer your questions.",
        "You can call me VoiceScribe Assistant. I'm designed to help with your queries.",
      ],
    },
    {
      patterns: ["weather", "temperature", "forecast", "raining", "sunny"],
      responses: [
        "I don't have access to real-time weather data, but I'd be happy to help with other questions!",
        "I can't check the weather for you, but I can assist with other topics.",
      ],
    },
    {
      patterns: ["time", "current time", "what time", "date", "today"],
      responses: [
        () =>
          `The current time is ${new Date().toLocaleTimeString()} and the date is ${new Date().toLocaleDateString()}.`,
      ],
    },
    {
      patterns: ["joke", "tell me a joke", "be funny"],
      responses: [
        "Why don't scientists trust atoms? Because they make up everything!",
        "What do you call fake spaghetti? An impasta!",
        "How does a penguin build its house? Igloos it together!",
      ],
    },
    {
      patterns: ["thank", "thanks", "thank you"],
      responses: [
        "You're welcome! Is there anything else I can help with?",
        "Happy to help! Let me know if you need anything else.",
        "Anytime! What else would you like to know?",
      ],
    },
    {
      patterns: ["sing", "song", "sing a song"],
      responses: [
        "🎵 Twinkle twinkle little star, how I wonder what you are. Up above the world so high, like a diamond in the sky. 🎵",
        "🎵 Row, row, row your boat, gently down the stream. Merrily, merrily, merrily, merrily, life is but a dream. 🎵",
        "🎵 The itsy bitsy spider went up the water spout. Down came the rain and washed the spider out. Out came the sun and dried up all the rain, and the itsy bitsy spider went up the spout again. 🎵",
      ],
    },
    {
      patterns: [
        "can you hear me",
        "can you listen",
        "are you listening",
        "do you hear me",
      ],
      responses: [
        "Yes, I can hear you clearly!",
        "I'm listening to you right now.",
        "I can hear you. How can I help?",
      ],
    },
  ];

  // Check for matches and return a response
  for (const category of responses) {
    if (category.patterns.some((pattern) => cleanQuestion.includes(pattern))) {
      const response =
        category.responses[
          Math.floor(Math.random() * category.responses.length)
        ];
      return typeof response === "function" ? response() : response;
    }
  }

  // Default responses if no pattern matches
  const defaultResponses = [
    "I'm not sure I understand. Could you rephrase your question?",
    "That's an interesting question. I'm still learning, so I might not have the perfect answer.",
    "I don't have information about that yet, but I'm happy to help with something else.",
    "I'm afraid I don't know the answer to that question. Is there something else I can help with?",
    "I'm not equipped to answer that specific question, but feel free to ask me something else!",
  ];

  return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
}

// Check if text is a question
function isQuestion(text) {
  // Remove spaces and check if it's not empty
  if (!text.trim()) return false;

  // Check for question marks
  if (text.includes("?")) return true;

  // Check for question words
  const questionWords = [
    "what",
    "when",
    "where",
    "who",
    "whom",
    "which",
    "whose",
    "why",
    "how",
    "can",
    "could",
    "would",
    "will",
    "shall",
    "should",
    "is",
    "are",
    "do",
    "does",
    "did",
    "have",
    "has",
    "had",
  ];

  const words = text.toLowerCase().split(" ");

  // Check if the text starts with a question word
  if (questionWords.includes(words[0])) return true;

  return false;
}

// Function to clean repeated phrases and words
function cleanRepeatedPhrases(text) {
  if (!text) return "";

  // Split the text into words
  const words = text.trim().split(/\s+/);

  // If we only have a few words, no need for complex processing
  if (words.length <= 3) return text;

  const cleanedWords = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    // Skip if this is a repetition of the previous word
    if (i > 0 && word.toLowerCase() === words[i - 1].toLowerCase()) {
      continue;
    }

    // Check for repeated phrases (2-3 word sequences)
    let skipWord = false;

    // Check 2-word phrases
    if (i < words.length - 1) {
      const phrase2 = `${word} ${words[i + 1]}`.toLowerCase();

      // Look back to see if this phrase already appeared
      for (let j = 0; j < cleanedWords.length - 1; j++) {
        const prevPhrase = `${cleanedWords[j]} ${
          cleanedWords[j + 1]
        }`.toLowerCase();
        if (phrase2 === prevPhrase) {
          skipWord = true;
          break;
        }
      }
    }

    // Check 3-word phrases
    if (!skipWord && i < words.length - 2) {
      const phrase3 = `${word} ${words[i + 1]} ${words[i + 2]}`.toLowerCase();

      // Look back to see if this phrase already appeared
      for (let j = 0; j < cleanedWords.length - 2; j++) {
        const prevPhrase = `${cleanedWords[j]} ${cleanedWords[j + 1]} ${
          cleanedWords[j + 2]
        }`.toLowerCase();
        if (phrase3 === prevPhrase) {
          skipWord = true;
          break;
        }
      }
    }

    if (!skipWord) {
      cleanedWords.push(word);
    }
  }

  // Join the cleaned words back together
  return cleanedWords.join(" ");
}

// Initialize speech recognition
function initSpeechRecognition() {
  if ("webkitSpeechRecognition" in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    // Force English recognition to get English characters for all speech
    recognition.lang = "en-US";

    recognition.maxAlternatives = 3; // Increase alternatives for better matching

    // Increase timeout to reduce disconnections
    recognition.timeout = 30000; // 30 seconds

    console.log(
      `Speech recognition initialized to force English transcription`
    );
    errorMessage.innerHTML = "";
  } else {
    console.error("Speech recognition not supported");
    errorMessage.innerHTML =
      '<i class="fas fa-exclamation-circle"></i> Speech recognition is not supported in your browser. Please use Chrome or Edge.';
    startBtn.disabled = true;
  }

  // Set up speech recognition event handlers
  if (recognition) {
    recognition.onresult = handleRecognitionResult;
    recognition.onerror = handleRecognitionError;
    recognition.onend = handleRecognitionEnd;
  }
}

// Handle recognition results
function handleRecognitionResult(event) {
  let interimTranscript = "";
  let finalTranscript = "";

  // Determine if this is in PTT mode
  if (isPushToTalkMode && isPttActive) {
    // Use the PTT handler instead
    handlePTTResult(event);
    return;
  }

  // Process the results
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const transcript = event.results[i][0].transcript;

    if (event.results[i].isFinal) {
      finalTranscript += transcript;
    } else {
      interimTranscript += transcript;
    }
  }

  // Only update UI if we have something new
  if (finalTranscript || interimTranscript) {
    // Show processing status for final results that are substantial
    if (finalTranscript && finalTranscript.trim().length > 3) {
      const now = Date.now();
      if (now - lastProcessingTime > minProcessingInterval) {
        showProcessingAnimation();
        lastProcessingTime = now;
      }

      // Clean final transcript to remove repetitions
      const cleanedTranscript = cleanRepeatedPhrases(finalTranscript);
      console.log(
        `Final transcript: ${finalTranscript} -> Cleaned: ${cleanedTranscript}`
      );

      // Add the cleaned final transcript to our full transcription
      fullTranscription.push(cleanedTranscript);

      // DISABLED: No longer check for questions in continuous mode
      // processForQuestions(cleanedTranscript);
    }

    // Clean interim transcript as well
    let displayInterim = interimTranscript;
    if (interimTranscript) {
      displayInterim = cleanRepeatedPhrases(interimTranscript);
    }

    // Update the display - with cleaned interim transcript
    updateTranscriptionDisplay(displayInterim);
  }
}

// Handle recognition errors
function handleRecognitionError(event) {
  console.error("Speech recognition error", event.error);

  // Don't show UI errors for no-speech as it's common
  if (event.error !== "no-speech") {
    let errorMsg = "";

    switch (event.error) {
      case "network":
        errorMsg =
          "Network error occurred. Please check your internet connection.";
        break;
      case "not-allowed":
      case "service-not-allowed":
        errorMsg =
          "Microphone access denied. Please allow microphone access to use this app.";
        break;
      case "aborted":
        errorMsg = "Recognition aborted";
        break;
      case "audio-capture":
        errorMsg = "Could not capture audio. Please check your microphone.";
        break;
      case "language-not-supported":
        errorMsg = "The selected language is not supported.";
        break;
      case "service-not-available":
        errorMsg =
          "Speech recognition service is not available. Please try again later.";
        break;
      default:
        errorMsg = `Error: ${event.error}`;
    }

    if (errorMsg) {
      errorMessage.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${errorMsg}`;
    }
  }

  // On error, stop the animation but don't stop recording
  hideProcessingAnimation();
  hideListeningAnimation();
}

// Handle recognition end
function handleRecognitionEnd() {
  console.log("Speech recognition ended");

  // Only auto-restart if we're in continuous mode and recording
  if (
    !isPushToTalkMode &&
    mediaRecorder &&
    mediaRecorder.state === "recording"
  ) {
    console.log("Restarting speech recognition...");
    try {
      recognition.start();
    } catch (e) {
      console.error("Error restarting recognition:", e);
    }
  } else {
    hideListeningAnimation();
  }
}

// Update the display with transcribed text
function updateTranscriptionDisplay(interimText) {
  // Get the last few items from the full transcription
  const recentTranscriptions = fullTranscription.slice(-5).join(". ");

  // If we have a recent transcription, add a period, otherwise start fresh
  let displayText = recentTranscriptions ? recentTranscriptions + ". " : "";

  // Add interim text if available
  if (interimText) {
    displayText += interimText;
  }

  // Update the display
  transcriptionText.innerHTML = displayText;

  // Update word and character counts
  updateCounts();
}

// Update word and character counts
function updateCounts() {
  const text = transcriptionText.textContent || "";

  // Count words (splitting by whitespace and filtering empty)
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  wordCount.textContent = `${words.length} words`;

  // Count characters
  charCount.textContent = `${text.length} characters`;
}

// Show listening animation
function showListeningAnimation() {
  listeningStatus.classList.remove("hidden");
  listeningStatus.style.opacity = 1;
}

// Hide listening animation
function hideListeningAnimation() {
  listeningStatus.style.opacity = 0;
  setTimeout(() => {
    listeningStatus.classList.add("hidden");
  }, 300);
}

// Show processing animation
function showProcessingAnimation() {
  // Clear any existing timeout
  if (processingTimeout) {
    clearTimeout(processingTimeout);
  }

  processingStatus.classList.remove("hidden");
  processingStatus.style.opacity = 1;
  isProcessing = true;

  // Auto-hide after 2 seconds
  processingTimeout = setTimeout(() => {
    hideProcessingAnimation();
  }, 2000);
}

// Hide processing animation
function hideProcessingAnimation() {
  processingStatus.style.opacity = 0;
  setTimeout(() => {
    processingStatus.classList.add("hidden");
  }, 300);
  isProcessing = false;
}

// Get available audio devices (microphones)
async function getAudioDevices() {
  try {
    // Check if mediaDevices is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      console.log("Media Devices API not supported in this browser");
      return;
    }

    // Get permission to access audio devices
    await navigator.mediaDevices.getUserMedia({ audio: true });

    // Get list of devices
    const devices = await navigator.mediaDevices.enumerateDevices();

    // Filter for audio input devices
    const audioInputDevices = devices.filter(
      (device) => device.kind === "audioinput"
    );

    // Clear dropdown except default option
    while (audioDevices.options.length > 1) {
      audioDevices.remove(1);
    }

    // Add devices to dropdown
    audioInputDevices.forEach((device) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.text = device.label || `Microphone ${audioDevices.options.length}`;
      audioDevices.appendChild(option);
    });

    // Select saved device if it exists
    const savedDeviceId = localStorage.getItem("selectedDeviceId");
    if (savedDeviceId) {
      // Check if the saved device is still available
      const deviceExists = Array.from(audioDevices.options).some(
        (option) => option.value === savedDeviceId
      );

      if (deviceExists) {
        audioDevices.value = savedDeviceId;
        selectedDeviceId = savedDeviceId;
      }
    }
  } catch (error) {
    console.error("Error getting audio devices:", error);
    errorMessage.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Error accessing microphone: ${error.message}`;
  }
}

// Load available voices for speech synthesis
function loadVoices() {
  voices = speechSynthesis.getVoices();

  if (voices.length === 0) {
    // No voices available yet, retry after a delay
    setTimeout(loadVoices, 500);
    return;
  }

  console.log("Voices loaded:", voices.length);

  // Clear dropdown
  voiceSelect.innerHTML = "";

  // Add voices to dropdown
  voices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.name;
    option.text = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(option);
  });

  // Select saved voice if it exists, otherwise select default
  if (selectedVoice && voices.some((v) => v.name === selectedVoice)) {
    voiceSelect.value = selectedVoice;
  } else if (voices.length > 0) {
    // Choose a good default - prefer English voices with natural sounding names
    const preferredVoices = [
      "Google UK English Female",
      "Microsoft Zira",
      "Samantha",
      "Google US English",
      "Microsoft David",
    ];

    for (const prefVoice of preferredVoices) {
      const match = voices.find((v) => v.name.includes(prefVoice));
      if (match) {
        voiceSelect.value = match.name;
        selectedVoice = match.name;
        localStorage.setItem("selectedVoice", match.name);
        break;
      }
    }

    // If no preferred voice found, select first English voice
    if (!selectedVoice) {
      const englishVoice = voices.find((v) => v.lang.startsWith("en-"));
      if (englishVoice) {
        voiceSelect.value = englishVoice.name;
        selectedVoice = englishVoice.name;
        localStorage.setItem("selectedVoice", englishVoice.name);
      }
    }
  }

  console.log("Selected voice:", selectedVoice);
}

// Event Listeners
window.onload = function () {
  console.log("Page loaded, initializing app...");
  listeningStatus.style.opacity = 0;
  processingStatus.style.opacity = 0;

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

// Apply dark mode if enabled
function applyTheme() {
  if (isDarkMode) {
    document.body.classList.add("dark-mode");
    themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
  } else {
    document.body.classList.remove("dark-mode");
    themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
  }
}

// Toggle transcription section expansion
function applyTranscriptionExpansion() {
  const isExpanded = localStorage.getItem("isExpanded") === "true";

  if (isExpanded) {
    transcriptionSection.classList.add("transcription-expanded");
    expandBtn.innerHTML = '<i class="fas fa-compress-alt"></i>';
  } else {
    transcriptionSection.classList.remove("transcription-expanded");
    expandBtn.innerHTML = '<i class="fas fa-expand-alt"></i>';
  }
}

// Update API key status display
function updateApiKeyStatus() {
  apiKeyStatus.textContent = "API key stored on server";
  apiKeyStatus.style.color = "var(--success)";
}

// Manage API key - no longer needed as it's handled server-side
function manageApiKey() {
  // Function disabled as API key is now stored on server
  errorMessage.innerHTML = `<i class="fas fa-info-circle"></i> API key is securely stored on the server.`;
  errorMessage.style.backgroundColor = "rgba(99, 102, 241, 0.1)";
  errorMessage.style.color = "var(--primary)";

  // Clear message after 5 seconds
  setTimeout(() => {
    errorMessage.innerHTML = "";
    errorMessage.style.backgroundColor = "";
    errorMessage.style.color = "";
  }, 5000);
}

// Stop speaking function
function stopSpeaking() {
  if (speechSynthesis.speaking) {
    console.log("Stopping speech");
    speechSynthesis.cancel();
    isResponding = false;
  }
  stopSpeakingContainer.style.display = "none";
}

// Save transcription to file
function saveTranscriptionToFile(text = null) {
  const content = text || transcriptionText.innerHTML;

  if (!content.trim()) {
    errorMessage.innerHTML =
      '<i class="fas fa-exclamation-triangle"></i> No text to save';
    return;
  }

  // Convert HTML to plain text if needed
  let plainText = content;
  if (!text) {
    // If we got the content from the HTML display, convert to plain text
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = content;
    plainText = tempDiv.textContent || tempDiv.innerText || "";
  }

  // Create file
  const blob = new Blob([plainText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  // Create download link
  const a = document.createElement("a");
  a.href = url;
  a.download = `transcription_${new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/:/g, "-")}.txt`;
  document.body.appendChild(a);
  a.click();

  // Clean up
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Save current transcription to history
function saveToHistory() {
  if (!transcriptionText.textContent.trim()) return;

  // Create history item
  const historyItem = {
    text: transcriptionText.textContent,
    timestamp: Date.now(),
  };

  // Add to history array
  transcriptionHistory.push(historyItem);

  // Limit history size
  if (transcriptionHistory.length > 50) {
    transcriptionHistory.shift();
  }

  // Save to local storage
  saveHistory();
}

// Load history from local storage on page load
function loadHistory() {
  const savedHistory = localStorage.getItem("transcriptionHistory");
  if (savedHistory) {
    transcriptionHistory = JSON.parse(savedHistory);
  }
  updateHistoryDisplay();
}

// Save history to local storage
function saveHistory() {
  localStorage.setItem(
    "transcriptionHistory",
    JSON.stringify(transcriptionHistory)
  );
}

// Update history display in the modal
function updateHistoryDisplay() {
  historyList.innerHTML = "";

  if (transcriptionHistory.length === 0) {
    emptyHistory.style.display = "block";
    return;
  }

  emptyHistory.style.display = "none";

  // Sort history by date, newest first
  transcriptionHistory.sort((a, b) => b.timestamp - a.timestamp);

  transcriptionHistory.forEach((item, index) => {
    const date = new Date(item.timestamp);
    const formattedDate = date.toLocaleString();

    const historyItem = document.createElement("li");
    historyItem.className = "history-item";
    historyItem.dataset.index = index;

    historyItem.innerHTML = `
      <div class="history-item-header">
        <span class="history-item-date">${formattedDate}</span>
        <div class="history-item-actions">
          <button class="history-item-action load-transcription" title="Load this transcription">
            <i class="fas fa-arrow-up-right-from-square"></i>
          </button>
          <button class="history-item-action save-transcription" title="Save as text file">
            <i class="fas fa-download"></i>
          </button>
          <button class="history-item-action delete-transcription" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="history-item-content">${item.text}</div>
    `;

    historyList.appendChild(historyItem);

    // Add event listeners to action buttons
    const loadBtn = historyItem.querySelector(".load-transcription");
    const saveBtn = historyItem.querySelector(".save-transcription");
    const deleteBtn = historyItem.querySelector(".delete-transcription");

    loadBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      loadTranscription(index);
    });

    saveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      saveTranscriptionToFile(item.text);
    });

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteTranscription(index);
    });

    // Toggle expand/collapse on item click
    historyItem.addEventListener("click", () => {
      historyItem.classList.toggle("expanded");
    });
  });
}

// Load a transcription from history
function loadTranscription(index) {
  const item = transcriptionHistory[index];
  if (item) {
    transcriptionText.innerText = item.text;
    fullTranscription = item.text.split(". ");
    historyModal.style.display = "none";

    // Enable save button
    saveBtn.disabled = false;
  }
}

// Delete a transcription from history
function deleteTranscription(index) {
  transcriptionHistory.splice(index, 1);
  saveHistory();
  updateHistoryDisplay();
}

// Start recording
async function startRecording() {
  try {
    // Request microphone access
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };

    // Use selected device if available
    if (selectedDeviceId) {
      audioConstraints.deviceId = { exact: selectedDeviceId };
    }

    // Get media stream
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
    });

    // Create media recorder
    mediaRecorder = new MediaRecorder(stream);

    // Set up data handling
    audioChunks = [];
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    // Start media recorder
    mediaRecorder.start();
    console.log("Media Recorder started");

    // Start speech recognition
    if (recognition) {
      // Reset for continuous mode
      recognition.continuous = true;
      recognition.onresult = handleRecognitionResult;
      recognition.start();
      console.log("Speech Recognition started");
    }

    // Update UI
    startBtn.disabled = true;
    stopBtn.disabled = false;
    saveBtn.disabled = true;
    showListeningAnimation();
    errorMessage.innerHTML = "";

    // Reset transcription to start new recording
    lastQuestion = ""; // Reset the last question

    // Clear any existing transcription if it's a new recording session
    if (!transcriptionText.textContent.trim()) {
      transcriptionText.innerHTML = "";
      fullTranscription = [];
    }
  } catch (error) {
    console.error("Error starting recording:", error);
    errorMessage.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Error: ${error.message}`;
  }
}

// Stop recording
function stopRecording() {
  // Stop media recorder if active
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    console.log("Media Recorder stopped");

    // Stop all tracks on the stream
    mediaRecorder.stream.getTracks().forEach((track) => track.stop());
  }

  // Stop speech recognition
  if (recognition) {
    try {
      recognition.stop();
      console.log("Speech Recognition stopped");
    } catch (e) {
      console.log("Error stopping recognition:", e);
    }
  }

  // Update UI
  startBtn.disabled = false;
  stopBtn.disabled = true;
  saveBtn.disabled = false;
  hideListeningAnimation();
  hideProcessingAnimation();

  // Save to history if we have content
  if (transcriptionText.textContent.trim()) {
    saveToHistory();
  }
}
