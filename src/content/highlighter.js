// Text highlighter for search results

class TextHighlighter {
  constructor() {
    this.matches = [];
    this.currentIndex = -1;
    this.originalNodes = new Map();
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

    if (!pattern) {
      return 0;
    }

    let regex;
    try {
      regex = new RegExp(pattern, 'gi');
    } catch (e) {
      console.error('Invalid regex pattern:', e);
      return 0;
    }

    const textNodes = this.getTextNodes();
    const nodesToProcess = [];

    // First pass: find all matches
    for (const node of textNodes) {
      const text = node.textContent;
      const matches = [...text.matchAll(regex)];

      if (matches.length > 0) {
        nodesToProcess.push({ node, matches, text });
      }
    }

    // Second pass: replace text nodes with highlighted versions
    for (const { node, matches, text } of nodesToProcess) {
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;

      for (const match of matches) {
        // Text before match
        if (match.index > lastIndex) {
          fragment.appendChild(
            document.createTextNode(text.slice(lastIndex, match.index))
          );
        }

        // Create highlight mark
        const mark = document.createElement('mark');
        mark.className = 'eps-highlight';
        mark.textContent = match[0];
        fragment.appendChild(mark);
        this.matches.push(mark);

        lastIndex = match.index + match[0].length;
      }

      // Text after last match
      if (lastIndex < text.length) {
        fragment.appendChild(
          document.createTextNode(text.slice(lastIndex))
        );
      }

      // Store original node for restoration
      this.originalNodes.set(fragment, node);

      // Replace original node
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
          // Skip empty or whitespace-only nodes
          if (!node.textContent.trim()) {
            return NodeFilter.FILTER_REJECT;
          }

          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          // Skip hidden elements
          const style = getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip script, style, and other non-content elements
          const tagName = parent.tagName.toLowerCase();
          const skipTags = ['script', 'style', 'noscript', 'iframe', 'textarea', 'input', 'select'];
          if (skipTags.includes(tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip our own search panel
          if (parent.closest('#enhanced-page-search-host')) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    return textNodes;
  }

  navigateToMatch(index) {
    if (this.matches.length === 0) return null;

    // Clamp index
    if (index < 0) index = this.matches.length - 1;
    if (index >= this.matches.length) index = 0;

    // Remove current highlight from previous match
    if (this.currentIndex >= 0 && this.matches[this.currentIndex]) {
      this.matches[this.currentIndex].classList.remove('eps-highlight-current');
    }

    // Set new current
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

    return {
      current: this.currentIndex + 1,
      total: this.matches.length
    };
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
    // Remove all highlight marks and restore original text
    const marks = document.querySelectorAll('mark.eps-highlight');
    marks.forEach(mark => {
      const parent = mark.parentNode;
      if (parent) {
        const textNode = document.createTextNode(mark.textContent);
        parent.replaceChild(textNode, mark);
        parent.normalize(); // Merge adjacent text nodes
      }
    });

    this.matches = [];
    this.currentIndex = -1;
    this.originalNodes.clear();
  }

  getMatchCount() {
    return this.matches.length;
  }

  getCurrentIndex() {
    return this.currentIndex;
  }
}

// Export for content script
window.TextHighlighter = TextHighlighter;
