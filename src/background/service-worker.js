// Enhanced Page Search - Service Worker

// Storage keys and model mappings
const StorageKeys = {
  API_KEY: 'vercel_api_key',
  MODEL_PREFERENCE: 'model_preference'
};

const ModelOptions = {
  FAST: 'fast',
  SLOW: 'slow'
};

const ModelMapping = {
  [ModelOptions.FAST]: 'anthropic/claude-3-5-haiku-20241022',
  [ModelOptions.SLOW]: 'anthropic/claude-sonnet-4-20250514'
};

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'toggleSearchPanel' });
  } catch (error) {
    // Content script might not be loaded yet, inject it
    console.log('Content script not ready, attempting to inject...');
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'generateRegex') {
    handleGenerateRegex(message.description)
      .then(regex => sendResponse({ success: true, regex }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (message.action === 'getSettings') {
    handleGetSettings()
      .then(settings => sendResponse({ success: true, settings }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'saveSettings') {
    handleSaveSettings(message.settings)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function handleGenerateRegex(description) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('API key not configured. Click the gear icon to add your Vercel AI Gateway API key.');
  }

  const modelPref = await getModelPreference();
  const model = ModelMapping[modelPref];

  const gateway = new VercelAIGateway(apiKey, model);
  return gateway.generateRegex(description);
}

async function handleGetSettings() {
  const apiKey = await getApiKey();
  const modelPref = await getModelPreference();
  return {
    hasApiKey: !!apiKey,
    apiKey: apiKey || '',
    modelPreference: modelPref
  };
}

async function handleSaveSettings(settings) {
  if (settings.apiKey !== undefined) {
    if (settings.apiKey) {
      await saveApiKey(settings.apiKey);
    } else {
      await chrome.storage.local.remove(StorageKeys.API_KEY);
    }
  }

  if (settings.modelPreference !== undefined) {
    await saveModelPreference(settings.modelPreference);
  }
}

// Helper functions (in case importScripts doesn't work in module context)
async function getApiKey() {
  const result = await chrome.storage.local.get(StorageKeys.API_KEY);
  return result[StorageKeys.API_KEY] || null;
}

async function getModelPreference() {
  const result = await chrome.storage.local.get(StorageKeys.MODEL_PREFERENCE);
  return result[StorageKeys.MODEL_PREFERENCE] || ModelOptions.SLOW;
}

async function saveApiKey(apiKey) {
  await chrome.storage.local.set({ [StorageKeys.API_KEY]: apiKey.trim() });
}

async function saveModelPreference(preference) {
  await chrome.storage.local.set({ [StorageKeys.MODEL_PREFERENCE]: preference });
}

// Vercel AI Gateway class (inline for service worker)
const VERCEL_AI_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

const SYSTEM_PROMPT = `You are a regex generation assistant. Given a natural language description of text patterns to find, generate a valid JavaScript regular expression.

Rules:
1. Output ONLY the regex pattern, nothing else
2. Do NOT include regex delimiters (/ /)
3. Do NOT include flags - they will be added separately
4. Make the regex as precise as possible while being practical
5. Use standard JavaScript regex syntax
6. Escape special characters properly with double backslashes where needed

Examples:
- "email addresses" → [a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}
- "phone numbers" → \\+?[\\d\\s\\-\\(\\)]{10,}
- "URLs" → https?:\\/\\/[^\\s]+
- "dates" → \\d{1,4}[-/.]\\d{1,2}[-/.]\\d{1,4}
- "words starting with test" → \\btest\\w*
- "numbers" → \\d+
- "prices" → \\$?\\d+(?:\\.\\d{2})?`;

class VercelAIGateway {
  constructor(apiKey, model) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateRegex(description) {
    if (!this.apiKey) {
      throw new Error('API key is required');
    }

    const response = await fetch(`${VERCEL_AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: description }
        ],
        max_tokens: 200,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `API request failed with status ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response from API');
    }

    const regexPattern = data.choices[0].message.content.trim();

    // Validate the regex pattern
    try {
      new RegExp(regexPattern);
    } catch (e) {
      throw new Error(`Generated invalid regex: ${e.message}`);
    }

    return regexPattern;
  }
}
