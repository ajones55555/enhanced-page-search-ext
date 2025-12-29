// Enhanced Page Search - Content Script
// This script is injected into every page and manages the search panel

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__enhancedPageSearchLoaded) {
    return;
  }
  window.__enhancedPageSearchLoaded = true;

  // Load dependencies
  const scriptBase = chrome.runtime.getURL('src/content/');

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // State
  let searchPanel = null;
  let highlighter = null;
  let isVisible = false;

  // Initialize highlighter immediately (it's a simple class)
  class TextHighlighter {
    constructor() {
      this.matches = [];
      this.currentIndex = -1;
      this.stylesInjected = false;
    }

    injectStyles() {
      if (this.stylesInjected) return;

      const existingStyle = document.getElementById('eps-highlight-styles');
      if (existingStyle) {
        this.stylesInjected = true;
        return;
      }

      const style = document.createElement('style');
      style.id = 'eps-highlight-styles';
      style.textContent = `
        mark.eps-highlight {
          background-color: #fff3cd !important;
          color: inherit !important;
          padding: 0 2px !important;
          margin: 0 !important;
          border-radius: 2px !important;
          box-decoration-break: clone !important;
        }

        mark.eps-highlight.eps-highlight-current {
          background-color: #ffc107 !important;
          outline: 2px solid #ffc107 !important;
          outline-offset: 0px !important;
        }

        @media (prefers-color-scheme: dark) {
          mark.eps-highlight {
            background-color: #4a3f00 !important;
          }
          mark.eps-highlight.eps-highlight-current {
            background-color: #b38600 !important;
            outline-color: #b38600 !important;
          }
        }
      `;
      document.head.appendChild(style);
      this.stylesInjected = true;
    }

    search(pattern) {
      this.clear();
      this.injectStyles();

      if (!pattern) return 0;

      let regex;
      try {
        regex = new RegExp(pattern, 'gi');
      } catch (e) {
        return 0;
      }

      const textNodes = this.getTextNodes();

      for (const node of textNodes) {
        const text = node.textContent;
        const matches = [...text.matchAll(regex)];

        if (matches.length === 0) continue;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;

        for (const match of matches) {
          if (match.index > lastIndex) {
            fragment.appendChild(
              document.createTextNode(text.slice(lastIndex, match.index))
            );
          }

          const mark = document.createElement('mark');
          mark.className = 'eps-highlight';
          mark.textContent = match[0];
          fragment.appendChild(mark);
          this.matches.push(mark);

          lastIndex = match.index + match[0].length;
        }

        if (lastIndex < text.length) {
          fragment.appendChild(
            document.createTextNode(text.slice(lastIndex))
          );
        }

        node.parentNode.replaceChild(fragment, node);
      }

      return this.matches.length;
    }

    getTextNodes() {
      const textNodes = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;

            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;

            const style = getComputedStyle(parent);
            if (style.display === 'none' || style.visibility === 'hidden') {
              return NodeFilter.FILTER_REJECT;
            }

            const tagName = parent.tagName.toLowerCase();
            const skipTags = ['script', 'style', 'noscript', 'iframe', 'textarea', 'input', 'select'];
            if (skipTags.includes(tagName)) return NodeFilter.FILTER_REJECT;

            if (parent.closest('#enhanced-page-search-host')) return NodeFilter.FILTER_REJECT;

            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      let node;
      while ((node = walker.nextNode())) textNodes.push(node);
      return textNodes;
    }

    navigateToMatch(index) {
      if (this.matches.length === 0) return null;

      if (index < 0) index = this.matches.length - 1;
      if (index >= this.matches.length) index = 0;

      if (this.currentIndex >= 0 && this.matches[this.currentIndex]) {
        this.matches[this.currentIndex].classList.remove('eps-highlight-current');
      }

      this.currentIndex = index;
      const currentMatch = this.matches[this.currentIndex];

      if (currentMatch) {
        currentMatch.classList.add('eps-highlight-current');
        currentMatch.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      }

      return { current: this.currentIndex + 1, total: this.matches.length };
    }

    next() {
      if (this.matches.length === 0) return null;
      return this.navigateToMatch(this.currentIndex + 1);
    }

    previous() {
      if (this.matches.length === 0) return null;
      return this.navigateToMatch(this.currentIndex - 1);
    }

    clear() {
      const marks = document.querySelectorAll('mark.eps-highlight');
      marks.forEach(mark => {
        const parent = mark.parentNode;
        if (parent) {
          const textNode = document.createTextNode(mark.textContent);
          parent.replaceChild(textNode, mark);
          parent.normalize();
        }
      });

      this.matches = [];
      this.currentIndex = -1;
    }
  }

  // SearchPanel class (inline to avoid loading issues)
  class SearchPanel {
    constructor(callbacks) {
      this.callbacks = callbacks;
      this.host = null;
      this.shadow = null;
      this.elements = {};
      this.settingsVisible = false;
      this.createPanel();
    }

    createPanel() {
      this.host = document.createElement('div');
      this.host.id = 'enhanced-page-search-host';
      // Use cssText to ensure 'all: initial' is applied BEFORE positioning
      this.host.style.cssText = `
        all: initial;
        position: fixed !important;
        top: 16px !important;
        right: 16px !important;
        z-index: 2147483647 !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      `;

      this.shadow = this.host.attachShadow({ mode: 'open' });

      const styles = document.createElement('style');
      styles.textContent = this.getStyles();
      this.shadow.appendChild(styles);

      const container = document.createElement('div');
      container.className = 'eps-container';
      container.innerHTML = this.getHTML();
      this.shadow.appendChild(container);

      this.elements = {
        container,
        panel: container.querySelector('.eps-panel'),
        settingsModal: container.querySelector('.eps-settings-modal'),
        settingsOverlay: container.querySelector('.eps-settings-overlay'),
        // Onboarding elements
        onboardingView: container.querySelector('#eps-onboarding'),
        onboardingKeyInput: container.querySelector('#eps-onboarding-key'),
        onboardingSaveBtn: container.querySelector('#eps-onboarding-save'),
        onboardingStatus: container.querySelector('#eps-onboarding-status'),
        // Search view elements
        searchView: container.querySelector('#eps-search-view'),
        descriptionInput: container.querySelector('#eps-description'),
        regexInput: container.querySelector('#eps-regex'),
        generateBtn: container.querySelector('#eps-generate'),
        prevBtn: container.querySelector('#eps-prev'),
        nextBtn: container.querySelector('#eps-next'),
        closeBtn: container.querySelector('#eps-close'),
        settingsBtn: container.querySelector('#eps-settings'),
        matchCount: container.querySelector('#eps-match-count'),
        errorMessage: container.querySelector('#eps-error'),
        loadingSpinner: container.querySelector('#eps-loading'),
        btnText: container.querySelector('.eps-btn-text'),
        apiKeyInput: container.querySelector('#eps-api-key'),
        modelFast: container.querySelector('#eps-model-fast'),
        modelSlow: container.querySelector('#eps-model-slow'),
        saveSettingsBtn: container.querySelector('#eps-save-settings'),
        closeSettingsBtn: container.querySelector('#eps-close-settings'),
        settingsStatus: container.querySelector('#eps-settings-status')
      };

      this.attachEventListeners();
      document.body.appendChild(this.host);
      this.host.style.display = 'none';
    }

    getHTML() {
      return `
        <div class="eps-panel">
          <div class="eps-header">
            <span class="eps-title">Enhanced Search</span>
            <div class="eps-header-actions">
              <button id="eps-settings" class="eps-icon-btn" title="Settings">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
                  <path fill-rule="evenodd" d="M6.5 1a.5.5 0 0 0-.5.5v1.02a4.5 4.5 0 0 0-1.313.656l-.72-.72a.5.5 0 0 0-.708 0l-1.06 1.06a.5.5 0 0 0 0 .708l.72.72A4.5 4.5 0 0 0 2.263 6.24H1.5a.5.5 0 0 0-.5.5v1.5a.5.5 0 0 0 .5.5h.763a4.5 4.5 0 0 0 .656 1.313l-.72.72a.5.5 0 0 0 0 .708l1.06 1.06a.5.5 0 0 0 .708 0l.72-.72a4.5 4.5 0 0 0 1.313.656v.763a.5.5 0 0 0 .5.5h1.5a.5.5 0 0 0 .5-.5v-.763a4.5 4.5 0 0 0 1.313-.656l.72.72a.5.5 0 0 0 .708 0l1.06-1.06a.5.5 0 0 0 0-.708l-.72-.72a4.5 4.5 0 0 0 .656-1.313h.763a.5.5 0 0 0 .5-.5v-1.5a.5.5 0 0 0-.5-.5h-.763a4.5 4.5 0 0 0-.656-1.313l.72-.72a.5.5 0 0 0 0-.708l-1.06-1.06a.5.5 0 0 0-.708 0l-.72.72A4.5 4.5 0 0 0 9.76 2.52V1.5a.5.5 0 0 0-.5-.5h-2.76zM8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>
                </svg>
              </button>
              <button id="eps-close" class="eps-icon-btn" title="Close (Esc)">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M1.4 14L0 12.6L5.6 7L0 1.4L1.4 0L7 5.6L12.6 0L14 1.4L8.4 7L14 12.6L12.6 14L7 8.4L1.4 14Z"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="eps-body">
            <!-- Onboarding view (shown when no API key) -->
            <div id="eps-onboarding" class="eps-onboarding">
              <div class="eps-field">
                <label for="eps-onboarding-key">Vercel AI Gateway API Key</label>
                <input type="password" id="eps-onboarding-key" placeholder="Enter your API key" />
                <p class="eps-hint">Required to generate regex patterns. <a href="https://vercel.com/docs/ai-gateway" target="_blank" rel="noopener">Get your key</a></p>
              </div>
              <div id="eps-onboarding-status" class="eps-settings-status"></div>
              <button id="eps-onboarding-save" class="eps-btn eps-btn-primary eps-btn-full">Save API Key</button>
            </div>
            <!-- Search view (shown when API key exists) -->
            <div id="eps-search-view">
              <div class="eps-field">
                <label for="eps-description">Describe what to find</label>
                <div class="eps-input-group">
                  <input type="text" id="eps-description" placeholder="e.g., email addresses, phone numbers, URLs" />
                  <button id="eps-generate" class="eps-btn eps-btn-primary" title="Generate regex from description">
                    <span class="eps-btn-text">Generate</span>
                    <span id="eps-loading" class="eps-spinner"></span>
                  </button>
                </div>
              </div>
              <div class="eps-field">
                <label for="eps-regex">Regex pattern</label>
                <input type="text" id="eps-regex" placeholder="Enter regex or generate from description above" />
              </div>
              <div id="eps-error" class="eps-error"></div>
              <div class="eps-footer">
                <div class="eps-nav">
                  <button id="eps-prev" class="eps-nav-btn" title="Previous match (Shift+Enter)">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                      <path d="M5 2L1 5L5 8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <button id="eps-next" class="eps-nav-btn" title="Next match (Enter)">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                      <path d="M5 2L9 5L5 8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>
                <span id="eps-match-count" class="eps-match-count">No matches</span>
              </div>
            </div>
          </div>
        </div>
        <div class="eps-settings-overlay"></div>
        <div class="eps-settings-modal">
          <div class="eps-settings-header">
            <span class="eps-title">Settings</span>
            <button id="eps-close-settings" class="eps-icon-btn" title="Close">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M1.4 14L0 12.6L5.6 7L0 1.4L1.4 0L7 5.6L12.6 0L14 1.4L8.4 7L14 12.6L12.6 14L7 8.4L1.4 14Z"/>
              </svg>
            </button>
          </div>
          <div class="eps-settings-body">
            <div class="eps-field">
              <label for="eps-api-key">Vercel AI Gateway API Key</label>
              <input type="password" id="eps-api-key" placeholder="Enter your API key" />
              <p class="eps-hint">Required. <a href="https://vercel.com/docs/ai-gateway" target="_blank" rel="noopener">Get your key</a></p>
            </div>
            <div class="eps-divider"></div>
            <div class="eps-field">
              <label>Model</label>
              <div class="eps-radio-group">
                <label class="eps-radio-option">
                  <input type="radio" name="eps-model" id="eps-model-fast" value="fast" />
                  <span class="eps-radio-label">
                    <strong>Fast / Simple</strong>
                    <span class="eps-radio-hint">Quick responses, basic patterns</span>
                  </span>
                </label>
                <label class="eps-radio-option">
                  <input type="radio" name="eps-model" id="eps-model-slow" value="slow" checked />
                  <span class="eps-radio-label">
                    <strong>Slow / Complex</strong>
                    <span class="eps-radio-hint">Better for complex patterns</span>
                  </span>
                </label>
              </div>
            </div>
            <div id="eps-settings-status" class="eps-settings-status"></div>
          </div>
          <div class="eps-settings-footer">
            <button id="eps-save-settings" class="eps-btn eps-btn-primary eps-btn-full">Save Settings</button>
          </div>
        </div>
      `;
    }

    getStyles() {
      return `
        :host {
          --eps-bg-primary: #ffffff;
          --eps-bg-secondary: #fafafa;
          --eps-border: #eaeaea;
          --eps-border-focus: #000000;
          --eps-text-primary: #000000;
          --eps-text-secondary: #666666;
          --eps-accent: #0070f3;
          --eps-error: #e00;
          --eps-success: #0070f3;
          --eps-shadow: 0 4px 14px 0 rgba(0, 0, 0, 0.1);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          line-height: 1.5;
          color: var(--eps-text-primary);
        }
        @media (prefers-color-scheme: dark) {
          :host {
            --eps-bg-primary: #0a0a0a;
            --eps-bg-secondary: #111111;
            --eps-border: #333333;
            --eps-border-focus: #ffffff;
            --eps-text-primary: #ededed;
            --eps-text-secondary: #888888;
            --eps-shadow: 0 4px 14px 0 rgba(0, 0, 0, 0.5);
          }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .eps-container { position: relative; }
        .eps-panel {
          background: var(--eps-bg-primary);
          border: 1px solid var(--eps-border);
          border-radius: 12px;
          box-shadow: var(--eps-shadow);
          width: 380px;
          overflow: hidden;
        }
        .eps-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--eps-border);
          background: var(--eps-bg-secondary);
        }
        .eps-header-actions { display: flex; gap: 4px; }
        .eps-title { font-weight: 600; font-size: 14px; color: var(--eps-text-primary); }
        .eps-icon-btn {
          background: transparent;
          border: none;
          color: var(--eps-text-secondary);
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }
        .eps-icon-btn:hover { background: var(--eps-border); color: var(--eps-text-primary); }
        .eps-body { padding: 16px; }
        .eps-field { margin-bottom: 12px; }
        .eps-field:last-child { margin-bottom: 0; }
        .eps-field label {
          display: block;
          font-size: 12px;
          font-weight: 500;
          color: var(--eps-text-secondary);
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .eps-input-group { display: flex; gap: 8px; }
        input[type="text"], input[type="password"] {
          flex: 1;
          padding: 10px 12px;
          border: 1px solid var(--eps-border);
          border-radius: 8px;
          font-size: 14px;
          font-family: inherit;
          background: var(--eps-bg-primary);
          color: var(--eps-text-primary);
          outline: none;
          transition: border-color 0.15s ease;
          width: 100%;
        }
        input[type="text"]:focus, input[type="password"]:focus { border-color: var(--eps-border-focus); }
        input[type="text"]::placeholder, input[type="password"]::placeholder { color: var(--eps-text-secondary); }
        .eps-btn {
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          border: 1px solid transparent;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          white-space: nowrap;
        }
        .eps-btn-primary { background: var(--eps-text-primary); color: var(--eps-bg-primary); }
        .eps-btn-primary:hover { opacity: 0.9; }
        .eps-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .eps-btn-full { width: 100%; }
        .eps-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid var(--eps-border);
        }
        .eps-nav { display: flex; gap: 4px; }
        .eps-nav-btn {
          width: 32px;
          height: 32px;
          border: 1px solid var(--eps-border);
          border-radius: 8px;
          background: var(--eps-bg-primary);
          color: var(--eps-text-primary);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }
        .eps-nav-btn:hover { background: var(--eps-bg-secondary); border-color: var(--eps-text-secondary); }
        .eps-nav-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .eps-match-count { font-size: 13px; color: var(--eps-text-secondary); font-variant-numeric: tabular-nums; }
        .eps-error {
          color: var(--eps-error);
          font-size: 13px;
          padding: 10px 12px;
          background: rgba(238, 0, 0, 0.08);
          border-radius: 8px;
          margin-bottom: 12px;
          display: none;
        }
        .eps-error.visible { display: block; }
        .eps-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid transparent;
          border-top-color: currentColor;
          border-radius: 50%;
          animation: eps-spin 0.6s linear infinite;
          display: none;
        }
        .eps-spinner.visible { display: block; }
        .eps-btn-text.hidden { display: none; }
        @keyframes eps-spin { to { transform: rotate(360deg); } }
        .eps-settings-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: none;
          z-index: 1;
        }
        .eps-settings-overlay.visible { display: block; }
        .eps-settings-modal {
          position: absolute;
          top: 0;
          right: 0;
          background: var(--eps-bg-primary);
          border: 1px solid var(--eps-border);
          border-radius: 12px;
          box-shadow: var(--eps-shadow);
          width: 380px;
          display: none;
          z-index: 2;
        }
        .eps-settings-modal.visible { display: block; }
        .eps-settings-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--eps-border);
          background: var(--eps-bg-secondary);
          border-radius: 12px 12px 0 0;
        }
        .eps-settings-body { padding: 16px; }
        .eps-settings-footer { padding: 16px; padding-top: 0; }
        .eps-hint { font-size: 12px; color: var(--eps-text-secondary); margin-top: 6px; }
        .eps-hint a { color: var(--eps-accent); text-decoration: none; }
        .eps-hint a:hover { text-decoration: underline; }
        .eps-divider { height: 1px; background: var(--eps-border); margin: 16px 0; }
        .eps-radio-group { display: flex; flex-direction: column; gap: 8px; }
        .eps-radio-option {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          cursor: pointer;
          padding: 12px;
          border: 1px solid var(--eps-border);
          border-radius: 8px;
          transition: all 0.15s ease;
        }
        .eps-radio-option:hover { border-color: var(--eps-text-secondary); }
        .eps-radio-option:has(input:checked) { border-color: var(--eps-text-primary); background: var(--eps-bg-secondary); }
        .eps-radio-option input[type="radio"] { margin-top: 3px; accent-color: var(--eps-text-primary); }
        .eps-radio-label { display: flex; flex-direction: column; gap: 2px; }
        .eps-radio-label strong { font-size: 14px; font-weight: 500; color: var(--eps-text-primary); }
        .eps-radio-hint { font-size: 12px; color: var(--eps-text-secondary); }
        .eps-settings-status {
          padding: 10px 12px;
          border-radius: 8px;
          font-size: 13px;
          margin-top: 12px;
          display: none;
        }
        .eps-settings-status.visible { display: block; }
        .eps-settings-status.success { background: rgba(0, 112, 243, 0.08); color: var(--eps-success); }
        .eps-settings-status.error { background: rgba(238, 0, 0, 0.08); color: var(--eps-error); }
        /* Onboarding view */
        .eps-onboarding { display: none; }
        .eps-onboarding.visible { display: block; }
        #eps-search-view { display: block; }
        #eps-search-view.hidden { display: none; }
      `;
    }

    attachEventListeners() {
      this.elements.generateBtn.addEventListener('click', () => this.handleGenerate());
      this.elements.descriptionInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleGenerate();
        }
      });
      this.elements.regexInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) {
            this.callbacks.onPrevious && this.handleNavigation('previous');
          } else {
            this.callbacks.onNext && this.handleNavigation('next');
          }
        }
      });
      let debounceTimer;
      this.elements.regexInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const regex = this.elements.regexInput.value.trim();
          if (regex) {
            this.callbacks.onSearch(regex);
          } else {
            this.setMatchCount(0);
          }
        }, 300);
      });
      this.elements.prevBtn.addEventListener('click', () => this.handleNavigation('previous'));
      this.elements.nextBtn.addEventListener('click', () => this.handleNavigation('next'));
      this.elements.closeBtn.addEventListener('click', () => this.callbacks.onClose());
      this.elements.settingsBtn.addEventListener('click', () => this.showSettings());
      this.elements.closeSettingsBtn.addEventListener('click', () => this.hideSettings());
      this.elements.settingsOverlay.addEventListener('click', () => this.hideSettings());
      this.elements.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
      // Onboarding save button
      this.elements.onboardingSaveBtn.addEventListener('click', () => this.saveOnboardingKey());
      this.elements.onboardingKeyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.saveOnboardingKey();
        }
      });
      this.shadow.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (this.settingsVisible) {
            this.hideSettings();
          } else {
            this.callbacks.onClose();
          }
        }
      });
    }

    handleGenerate() {
      const description = this.elements.descriptionInput.value.trim();
      if (description && this.callbacks.onGenerate) {
        this.callbacks.onGenerate(description);
      }
    }

    handleNavigation(direction) {
      const result = direction === 'next' ? this.callbacks.onNext() : this.callbacks.onPrevious();
      if (result) this.setMatchCount(result.total, result.current);
    }

    async showSettings() {
      this.settingsVisible = true;
      this.elements.settingsModal.classList.add('visible');
      this.elements.settingsOverlay.classList.add('visible');
      try {
        const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
        if (response.success) {
          this.elements.apiKeyInput.value = response.settings.apiKey || '';
          if (response.settings.modelPreference === 'slow') {
            this.elements.modelSlow.checked = true;
          } else {
            this.elements.modelFast.checked = true;
          }
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
      this.elements.apiKeyInput.focus();
    }

    hideSettings() {
      this.settingsVisible = false;
      this.elements.settingsModal.classList.remove('visible');
      this.elements.settingsOverlay.classList.remove('visible');
      this.elements.settingsStatus.classList.remove('visible');
      this.elements.descriptionInput.focus();
    }

    async saveSettings() {
      const apiKey = this.elements.apiKeyInput.value.trim();
      const modelPreference = this.elements.modelSlow.checked ? 'slow' : 'fast';
      try {
        this.elements.saveSettingsBtn.disabled = true;
        this.elements.saveSettingsBtn.textContent = 'Saving...';
        const response = await chrome.runtime.sendMessage({
          action: 'saveSettings',
          settings: { apiKey, modelPreference }
        });
        if (response.success) {
          this.showSettingsStatus('Settings saved successfully', 'success');
          setTimeout(() => this.hideSettings(), 1000);
        } else {
          this.showSettingsStatus(response.error || 'Failed to save settings', 'error');
        }
      } catch (error) {
        this.showSettingsStatus(error.message || 'Failed to save settings', 'error');
      } finally {
        this.elements.saveSettingsBtn.disabled = false;
        this.elements.saveSettingsBtn.textContent = 'Save Settings';
      }
    }

    showSettingsStatus(message, type) {
      this.elements.settingsStatus.textContent = message;
      this.elements.settingsStatus.className = `eps-settings-status visible ${type}`;
    }

    async saveOnboardingKey() {
      const apiKey = this.elements.onboardingKeyInput.value.trim();
      if (!apiKey) {
        this.showOnboardingStatus('Please enter an API key', 'error');
        return;
      }
      try {
        this.elements.onboardingSaveBtn.disabled = true;
        this.elements.onboardingSaveBtn.textContent = 'Saving...';
        const response = await chrome.runtime.sendMessage({
          action: 'saveSettings',
          settings: { apiKey }
        });
        if (response.success) {
          this.showOnboardingStatus('API key saved!', 'success');
          setTimeout(() => {
            this.showSearchView();
          }, 500);
        } else {
          this.showOnboardingStatus(response.error || 'Failed to save', 'error');
        }
      } catch (error) {
        this.showOnboardingStatus(error.message || 'Failed to save', 'error');
      } finally {
        this.elements.onboardingSaveBtn.disabled = false;
        this.elements.onboardingSaveBtn.textContent = 'Save API Key';
      }
    }

    showOnboardingStatus(message, type) {
      this.elements.onboardingStatus.textContent = message;
      this.elements.onboardingStatus.className = `eps-settings-status visible ${type}`;
    }

    showOnboardingView() {
      this.elements.onboardingView.classList.add('visible');
      this.elements.searchView.classList.add('hidden');
      this.elements.settingsBtn.style.display = 'none';
      this.elements.onboardingKeyInput.focus();
    }

    showSearchView() {
      this.elements.onboardingView.classList.remove('visible');
      this.elements.searchView.classList.remove('hidden');
      this.elements.settingsBtn.style.display = '';
      this.elements.onboardingStatus.classList.remove('visible');
      this.elements.descriptionInput.focus();
    }

    async show() {
      this.host.style.display = 'block';

      // Check if API key exists
      try {
        const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
        if (response.success && response.settings.apiKey) {
          this.showSearchView();
        } else {
          this.showOnboardingView();
        }
      } catch (error) {
        // If we can't check, show onboarding
        this.showOnboardingView();
      }
    }

    hide() {
      this.host.style.display = 'none';
      this.hideSettings();
    }

    setRegex(regex) { this.elements.regexInput.value = regex; }

    setLoading(isLoading) {
      this.elements.generateBtn.disabled = isLoading;
      this.elements.loadingSpinner.classList.toggle('visible', isLoading);
      this.elements.btnText.classList.toggle('hidden', isLoading);
    }

    setMatchCount(total, current = null) {
      if (total === 0) {
        this.elements.matchCount.textContent = 'No matches';
      } else if (current !== null) {
        this.elements.matchCount.textContent = `${current} of ${total}`;
      } else {
        this.elements.matchCount.textContent = `${total} match${total === 1 ? '' : 'es'}`;
      }
    }

    setError(message) {
      if (message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorMessage.classList.add('visible');
      } else {
        this.elements.errorMessage.classList.remove('visible');
      }
    }

    clearError() { this.setError(null); }

    destroy() {
      if (this.host && this.host.parentNode) {
        this.host.parentNode.removeChild(this.host);
      }
    }
  }

  // Initialize
  function initialize() {
    highlighter = new TextHighlighter();
  }

  // Toggle search panel
  function toggleSearchPanel() {
    if (!searchPanel) {
      searchPanel = new SearchPanel({
        onSearch: handleSearch,
        onGenerate: handleGenerate,
        onNext: () => highlighter.next(),
        onPrevious: () => highlighter.previous(),
        onClose: closeSearchPanel
      });
    }

    if (isVisible) {
      closeSearchPanel();
    } else {
      searchPanel.show();
      isVisible = true;
    }
  }

  // Close search panel
  function closeSearchPanel() {
    if (searchPanel) {
      searchPanel.hide();
      highlighter.clear();
      isVisible = false;
    }
  }

  // Handle search
  function handleSearch(regex) {
    if (!searchPanel) return;

    searchPanel.clearError();

    try {
      // Validate regex
      new RegExp(regex);

      const count = highlighter.search(regex);
      searchPanel.setMatchCount(count);

      if (count > 0) {
        const result = highlighter.next();
        if (result) {
          searchPanel.setMatchCount(result.total, result.current);
        }
      }
    } catch (error) {
      searchPanel.setError('Invalid regex pattern');
      searchPanel.setMatchCount(0);
    }
  }

  // Handle generate
  async function handleGenerate(description) {
    if (!searchPanel) return;

    searchPanel.clearError();
    searchPanel.setLoading(true);

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'generateRegex',
        description
      });

      if (response.success) {
        searchPanel.setRegex(response.regex);
        handleSearch(response.regex);
      } else {
        searchPanel.setError(response.error);
      }
    } catch (error) {
      searchPanel.setError(error.message || 'Failed to generate regex');
    } finally {
      searchPanel.setLoading(false);
    }
  }

  // Listen for messages from service worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggleSearchPanel') {
      toggleSearchPanel();
      sendResponse({ success: true });
    }
    return true;
  });

  // Handle escape key globally
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isVisible) {
      closeSearchPanel();
    }
  });

  // Initialize on load
  initialize();
})();
