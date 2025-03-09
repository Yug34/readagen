<script lang="ts" setup>
import { ref, onMounted, watch } from 'vue';
import { browser } from 'wxt/browser';

// State management
const pageContent = ref('');
const pageTitle = ref('');
const isLoading = ref(false);
const error = ref('');
const isReading = ref(false);
const currentSpeechIndex = ref(0);
const contentSegments = ref([]);
const speechRate = ref(1);
const speechPitch = ref(1);
const speechVoice = ref('');
const availableVoices = ref([]);

// Speech synthesis
let speechSynthesis = null;
let speechUtterance = null;

// Load saved values
onMounted(async () => {
  // Load saved speech settings
  const savedRate = localStorage.getItem('wxt-speech-rate');
  if (savedRate !== null) {
    speechRate.value = parseFloat(savedRate);
  }

  const savedPitch = localStorage.getItem('wxt-speech-pitch');
  if (savedPitch !== null) {
    speechPitch.value = parseFloat(savedPitch);
  }

  const savedVoice = localStorage.getItem('wxt-speech-voice');
  if (savedVoice) {
    speechVoice.value = savedVoice;
  }

  // Initialize speech synthesis
  initSpeechSynthesis();
});

// Watch for changes to speech settings
watch(speechRate, (newValue) => {
  localStorage.setItem('wxt-speech-rate', newValue.toString());
});

watch(speechPitch, (newValue) => {
  localStorage.setItem('wxt-speech-pitch', newValue.toString());
});

watch(speechVoice, (newValue) => {
  localStorage.setItem('wxt-speech-voice', newValue);
});

// Initialize speech synthesis and get available voices
const initSpeechSynthesis = () => {
  if ('speechSynthesis' in window) {
    speechSynthesis = window.speechSynthesis;

    // Get available voices
    const getVoices = () => {
      const voices = speechSynthesis.getVoices();
      if (voices.length) {
        availableVoices.value = voices;

        // Set default voice if none is selected
        if (!speechVoice.value && voices.length) {
          // Try to find a default English voice
          const defaultVoice = voices.find(voice =>
              voice.lang.includes('en') && voice.default
          ) || voices[0];

          speechVoice.value = defaultVoice.name;
        }
      }
    };

    // Chrome loads voices asynchronously
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = getVoices;
    }

    getVoices();
  } else {
    error.value = 'Speech synthesis not supported in this browser';
  }
};

// Function to extract content from active tab using Readability
const getPageContent = async () => {
  isLoading.value = true;
  error.value = '';
  pageContent.value = '';
  contentSegments.value = [];

  try {
    // Get the active tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    if (!activeTab || !activeTab.id) {
      throw new Error('No active tab found');
    }

    // First, inject Readability.js into the page
    await browser.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['readability.js'] // Make sure this file is in your extension's files
    });

    // Then execute script to extract content using Readability
    const result = await browser.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: () => {
        try {
          // This runs in the context of the web page
          // @ts-ignore - Readability should be injected at this point
          const reader = new window.Readability(document.cloneNode(true));
          const article = reader.parse();

          if (!article) {
            return { error: 'Failed to parse content' };
          }

          // Create a temporary div to hold the content
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = article.content;

          // Extract text from paragraphs and headings for screen reading
          const segments = [];
          const contentElements = tempDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');

          contentElements.forEach(element => {
            const text = element.textContent.trim();
            if (text.length > 0) {
              const tag = element.tagName.toLowerCase();
              segments.push({
                text,
                tag,
                isPriority: tag.startsWith('h')  // Headings are higher priority
              });
            }
          });

          return {
            title: article.title,
            content: article.content,
            segments: segments,
            excerpt: article.excerpt,
            byline: article.byline,
            url: window.location.href
          };
        } catch (err) {
          return { error: err.toString() };
        }
      }
    });

    // Process the result
    if (result && result[0] && result[0].result) {
      const article = result[0].result;

      if (article.error) {
        throw new Error(article.error);
      }

      pageTitle.value = article.title;
      pageContent.value = article.content;
      contentSegments.value = article.segments || [];

      // Store in localStorage
      localStorage.setItem('wxt-page-content', article.content);
      localStorage.setItem('wxt-page-title', article.title);
      localStorage.setItem('wxt-page-url', article.url);
    } else {
      throw new Error('Failed to extract content');
    }
  } catch (err) {
    console.error('Error extracting page content:', err);
    error.value = err instanceof Error ? err.message : 'Unknown error occurred';
  } finally {
    isLoading.value = false;
  }
};

// Start reading the content aloud
const startReading = () => {
  if (!contentSegments.value.length) {
    error.value = 'No content to read';
    return;
  }

  if (!speechSynthesis) {
    error.value = 'Speech synthesis not available';
    return;
  }

  // Stop any current speech
  stopReading();

  // Reset to beginning if we're at the end
  if (currentSpeechIndex.value >= contentSegments.value.length) {
    currentSpeechIndex.value = 0;
  }

  isReading.value = true;
  speakCurrentSegment();
};

// Speak the current segment
const speakCurrentSegment = () => {
  if (!isReading.value || currentSpeechIndex.value >= contentSegments.value.length) {
    isReading.value = false;
    return;
  }

  const segment = contentSegments.value[currentSpeechIndex.value];

  speechUtterance = new SpeechSynthesisUtterance(segment.text);
  speechUtterance.rate = speechRate.value;
  speechUtterance.pitch = speechPitch.value;

  // Set the selected voice if available
  if (speechVoice.value) {
    const selectedVoice = availableVoices.value.find(voice => voice.name === speechVoice.value);
    if (selectedVoice) {
      speechUtterance.voice = selectedVoice;
    }
  }

  // Handle when speech ends
  speechUtterance.onend = () => {
    currentSpeechIndex.value++;
    speakCurrentSegment();
  };

  // Handle errors
  speechUtterance.onerror = (event) => {
    console.error('Speech synthesis error:', event);
    error.value = 'Error during speech synthesis';
    isReading.value = false;
  };

  speechSynthesis.speak(speechUtterance);
};

// Stop reading
const stopReading = () => {
  if (speechSynthesis) {
    speechSynthesis.cancel();
    isReading.value = false;
  }
};

// Pause/resume reading
const togglePause = () => {
  if (!speechSynthesis) return;

  if (speechSynthesis.paused) {
    speechSynthesis.resume();
  } else {
    speechSynthesis.pause();
  }
};

// Skip to next segment
const nextSegment = () => {
  if (!isReading.value) return;

  stopReading();
  currentSpeechIndex.value++;
  startReading();
};

// Go back to previous segment
const prevSegment = () => {
  if (!isReading.value) return;

  stopReading();
  currentSpeechIndex.value = Math.max(0, currentSpeechIndex.value - 1);
  startReading();
};
</script>

<template>
  <button type="button" @click="getPageContent" :disabled="isLoading">
    {{ isLoading ? 'Loading...' : 'Extract Content' }}
  </button>

  <div v-if="error" class="error">
    {{ error }}
  </div>

  <div v-if="pageTitle" class="page-title">
    <h2>{{ pageTitle }}</h2>
  </div>

  <!-- Screen Reader Controls -->
  <div v-if="contentSegments.length > 0" class="reader-controls">
    <h3>Screen Reader</h3>

    <div class="control-row">
      <button @click="startReading" :disabled="isReading">Start Reading</button>
      <button @click="stopReading" :disabled="!isReading">Stop</button>
      <button @click="togglePause" :disabled="!isReading">Pause/Resume</button>
      <button @click="prevSegment" :disabled="!isReading">Previous</button>
      <button @click="nextSegment" :disabled="!isReading">Next</button>
    </div>

    <div class="settings">
      <div class="setting">
        <label for="rate">Speed:</label>
        <input type="range" id="rate" v-model="speechRate" min="0.5" max="2" step="0.1" />
        <span>{{ speechRate }}x</span>
      </div>

      <div class="setting">
        <label for="pitch">Pitch:</label>
        <input type="range" id="pitch" v-model="speechPitch" min="0.5" max="2" step="0.1" />
        <span>{{ speechPitch }}</span>
      </div>

      <div class="setting" v-if="availableVoices.length > 0">
        <label for="voice">Voice:</label>
        <select id="voice" v-model="speechVoice">
          <option v-for="voice in availableVoices" :key="voice.name" :value="voice.name">
            {{ voice.name }} ({{ voice.lang }})
          </option>
        </select>
      </div>
    </div>

    <!-- Current segment being read -->
    <div v-if="isReading && currentSpeechIndex < contentSegments.length" class="current-segment">
      <h4>Now Reading:</h4>
      <p>{{ contentSegments[currentSpeechIndex].text }}</p>
    </div>
  </div>

  <!-- Content Preview -->
  <div class="content-preview" v-if="pageContent">
    <h3>Content Preview</h3>
    <div v-html="pageContent"></div>
  </div>
</template>

<style scoped>
.error {
  color: red;
  margin: 1rem 0;
  padding: 0.5rem;
  background-color: #ffeeee;
  border-radius: 4px;
}

.page-title {
  margin: 1rem 0;
}

.reader-controls {
  margin: 1rem 0;
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  background-color: #f9f9f9;
}

.control-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.control-row button {
  padding: 0.5rem 1rem;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.control-row button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.settings {
  margin: 1rem 0;
}

.setting {
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem;
  gap: 0.5rem;
}

.setting label {
  width: 80px;
}

.setting input[type="range"] {
  flex: 1;
  max-width: 200px;
}

.current-segment {
  margin: 1rem 0;
  padding: 1rem;
  background-color: #e6f7ff;
  border-radius: 4px;
}

.content-preview {
  margin-top: 1rem;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #ddd;
  padding: 1rem;
  text-align: left;
}
</style>