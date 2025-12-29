// Storage keys
const StorageKeys = {
  API_KEY: 'vercel_api_key',
  MODEL_PREFERENCE: 'model_preference'
};

// Model options displayed to users
const ModelOptions = {
  FAST: 'fast',
  SLOW: 'slow'
};

// Actual model identifiers for Vercel AI Gateway
const ModelMapping = {
  [ModelOptions.FAST]: 'anthropic/claude-3-5-haiku-20241022',
  [ModelOptions.SLOW]: 'anthropic/claude-sonnet-4-20250514'
};

// Save API key to chrome.storage.local
async function saveApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
    throw new Error('Invalid API key');
  }
  await chrome.storage.local.set({ [StorageKeys.API_KEY]: apiKey.trim() });
}

// Retrieve API key from chrome.storage.local
async function getApiKey() {
  const result = await chrome.storage.local.get(StorageKeys.API_KEY);
  return result[StorageKeys.API_KEY] || null;
}

// Save model preference
async function saveModelPreference(preference) {
  if (!Object.values(ModelOptions).includes(preference)) {
    throw new Error('Invalid model preference');
  }
  await chrome.storage.local.set({ [StorageKeys.MODEL_PREFERENCE]: preference });
}

// Retrieve model preference
async function getModelPreference() {
  const result = await chrome.storage.local.get(StorageKeys.MODEL_PREFERENCE);
  return result[StorageKeys.MODEL_PREFERENCE] || ModelOptions.SLOW;
}

// Get the actual model identifier for API calls
async function getModelIdentifier() {
  const preference = await getModelPreference();
  return ModelMapping[preference];
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.EPS_Storage = {
    StorageKeys,
    ModelOptions,
    ModelMapping,
    saveApiKey,
    getApiKey,
    saveModelPreference,
    getModelPreference,
    getModelIdentifier
  };
}
