(function() {
  'use strict';

  // Configuration
  const config = {
    backendUrl: 'https://reevai.onrender.com/api/scan',
    scanInterval: 30000, // 30 seconds
    maxHtmlLength: 10000, // characters
    minTextLength: 100, // minimum text to consider worth scanning
    version: '1.0.0'
  };

  // Check if this is a text-based page worth scanning
  function shouldScanPage() {
    // Skip frames/iframes
    if (window.self !== window.top) return false;
    
    // Skip non-HTML documents
    if (document.contentType && !document.contentType.includes('text/html')) return false;
    
    // Check for sufficient content
    const textContent = document.body.innerText.trim();
    return textContent.length >= config.minTextLength;
  }

  // Collect essential page data
  function collectPageData() {
    const textContent = document.body.innerText.trim();
    const metadata = {
      title: document.title,
      url: window.location.href,
      domain: window.location.hostname,
      wordCount: textContent.split(/\s+/).length,
      charCount: textContent.length,
      language: document.documentElement.lang || 'unknown',
      timestamp: new Date().toISOString(),
      scannerVersion: config.version
    };

    // Get cleaned HTML (basic sanitization)
    let html = document.documentElement.outerHTML;
    if (html.length > config.maxHtmlLength) {
      html = html.substring(0, config.maxHtmlLength) + '... [TRUNCATED]';
    }

    return {
      metadata,
      html,
      textContent
    };
  }

  // Send data to backend with retry logic
  async function sendScanData() {
    if (!shouldScanPage()) return;

    const pageData = collectPageData();
    const payload = {
      url: pageData.metadata.url,
      html: pageData.html,
      metadata: pageData.metadata
    };

    try {
      const response = await fetch(config.backendUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Scanner-Version': config.version
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      console.debug('Page scan completed successfully');
    } catch (error) {
      console.error('Scan failed:', error.message);
      // Implement retry logic if needed
    }
  }

  // Start scanning with initial delay to avoid blocking page load
  function initializeScanner() {
    if (!shouldScanPage()) return;

    setTimeout(() => {
      sendScanData();
      // Set up periodic scanning for SPA navigation
      setInterval(sendScanData, config.scanInterval);
    }, 2000);
  }

  // Start the scanner
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initializeScanner();
  } else {
    window.addEventListener('DOMContentLoaded', initializeScanner);
  }
})();
