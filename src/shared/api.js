// Vercel AI Gateway client for regex generation

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

    if (!description || typeof description !== 'string') {
      throw new Error('Description is required');
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

// Export for use in service worker
if (typeof self !== 'undefined') {
  self.VercelAIGateway = VercelAIGateway;
}
