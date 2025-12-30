# Regex Search

A Chrome extension that generates regex patterns from natural language descriptions using AI, then highlights matches on the page.

## Features

- **Natural Language to Regex**: Describe what you're looking for (e.g., "email addresses", "phone numbers", "prices") and the AI generates a regex pattern
- **Live Highlighting**: Matches are highlighted on the page with keyboard navigation
- **Manual Regex**: Enter your own regex patterns directly
- **Dark Mode Support**: Adapts to your system theme

## Installation

### From Source

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked" and select the extension folder
5. Click the extension icon to open the search panel

## Setup

On first use, you'll be prompted to enter your Vercel AI Gateway API key:

1. Get your API key from [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)
2. Enter the key in the extension and click "Save API Key"

## Usage

1. Click the extension icon to open the search panel
2. Either:
   - **Generate**: Type a description (e.g., "URLs", "dates", "words starting with test") and click Generate
   - **Manual**: Enter a regex pattern directly in the "Regex pattern" field
3. Use the arrow buttons or keyboard shortcuts to navigate between matches:
   - `Enter` - Next match
   - `Shift+Enter` - Previous match
   - `Escape` - Close panel

## Settings

Click the gear icon to access settings:

- **API Key**: Your Vercel AI Gateway API key
- **Model**: Choose between:
  - **Fast / Simple**: Quick responses, good for basic patterns
  - **Slow / Complex**: Better for complex patterns (default)

## Development

```
enhanced-page-search-ext/
├── manifest.json
├── icons/
│   └── icon[16|32|48|128].png
└── src/
    ├── background/
    │   └── service-worker.js    # API calls, message handling
    ├── content/
    │   └── content.js           # UI panel, text highlighting
    └── shared/
        ├── api.js               # Vercel AI Gateway client
        └── storage.js           # Chrome storage helpers
```

## License

MIT
