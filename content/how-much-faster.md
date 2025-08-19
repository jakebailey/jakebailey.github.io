---
title: How much faster?
layout: single
showReadingTime: false
showToc: false
showWordCount: false
comments: false
---

{{< rawhtml >}}

<style>
  .post-header {
    text-align: center !important;
  }

  .entry-hint-parent {
    justify-content: center !important;
  }

  .calculator-container {
    max-width: 600px;
    margin: 0 auto;
    padding: 1rem;
  }

  .calculator-form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    margin-bottom: 2rem;
  }

  @media (max-width: 640px) {
    .calculator-form {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
  }

  .input-group {
    display: flex;
    flex-direction: column;
  }

  .input-group label {
    font-weight: 500;
    margin-bottom: 0.5rem;
    color: var(--primary);
  }

  .input-group input {
    padding: 0.75rem;
    font-size: 1.1rem;
    border: 2px solid var(--border);
    border-radius: var(--radius);
    background: var(--entry);
    color: var(--primary);
    transition: border-color 0.2s ease;
  }

  /* Hide number input spinners */
  .input-group input[type="number"]::-webkit-outer-spin-button,
  .input-group input[type="number"]::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .input-group input[type="number"] {
    -moz-appearance: textfield;
  }

  .input-group input:focus {
    outline: none;
    border-color: var(--secondary);
  }

  .results-container {
    background: var(--entry);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.5rem;
    margin-top: 1rem;
    opacity: 0;
    transform: translateY(-10px);
    transition: all 0.3s ease;
  }

  .results-container.show {
    opacity: 1;
    transform: translateY(0);
  }

  .results-container h3 {
    margin: 0 0 1rem 0;
    color: var(--primary);
    font-size: 1.2rem;
  }

  .result-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }

  .result-item:last-child {
    border-bottom: none;
  }

  .result-label {
    color: var(--content);
  }

  .result-value {
    font-weight: 600;
    font-size: 1.1rem;
    color: var(--primary);
  }

  .result-value.positive {
    color: #22c55e;
  }

  .result-value.negative {
    color: #ef4444;
  }

  .copy-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--primary);
    color: var(--theme);
    border: none;
    border-radius: var(--radius);
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-top: 1rem;
  }

  .copy-button:hover {
    opacity: 0.8;
    transform: translateY(-1px);
  }

  .copy-button:active {
    transform: translateY(0);
  }

  .copy-button.copied {
    background: #22c55e;
  }

  .copy-button svg {
    width: 16px;
    height: 16px;
  }

  .attribution {
    max-width: 600px;
    margin: 2rem auto 0 auto;
    padding: 1rem;
    text-align: center;
    color: var(--secondary);
    font-size: 0.9rem;
    border-top: 1px solid var(--border);
  }

  .attribution a {
    color: var(--primary);
    text-decoration: none;
  }

  .attribution a:hover {
    text-decoration: underline;
  }
</style>

<div class="calculator-container">
  <div class="calculator-form">
    <div class="input-group">
      <label for="baseline">Old time:</label>
      <input type="number" id="baseline" step="any" placeholder="e.g., 100">
    </div>
    <div class="input-group">
      <label for="newtime">New time:</label>
      <input type="number" id="newtime" step="any" placeholder="e.g., 50">
    </div>
  </div>

<div id="results" class="results-container">
    <h3>Results</h3>
    <div class="result-item">
      <span class="result-label">Performance improvement:</span>
      <span id="faster-percent" class="result-value">—</span>
    </div>
    <div class="result-item">
      <span class="result-label">Speed multiplier:</span>
      <span id="faster-times" class="result-value">—</span>
    </div>
    <div class="result-item">
      <span class="result-label">Time saved:</span>
      <span id="less-time" class="result-value">—</span>
    </div>
    <button id="copy-button" class="copy-button" onclick="copyLink()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
      Copy Link
    </button>
  </div>
</div>

<div class="attribution">
  Inspired by <a href="https://github.com/paulirish" target="_blank" rel="noopener">Paul Irish</a>'s original
  <a href="https://web.archive.org/web/20221205231334/https://how-much-faster.glitch.me/" target="_blank" rel="noopener">how-much-faster</a> page
</div>

<script>
  // Hash routing functions
  function updateHash() {
    const baseline = document.getElementById('baseline').value;
    const newtime = document.getElementById('newtime').value;

    if (baseline && newtime) {
      window.location.hash = `old=${baseline}&new=${newtime}`;
    } else {
      window.location.hash = '';
    }
  }

  function loadFromHash() {
    const hash = window.location.hash.substring(1);
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const baseline = params.get('old');
    const newtime = params.get('new');

    if (baseline) {
      document.getElementById('baseline').value = baseline;
    }
    if (newtime) {
      document.getElementById('newtime').value = newtime;
    }

    if (baseline || newtime) {
      calculate();
    }
  }

  // Copy link function
  function copyLink() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      const button = document.getElementById('copy-button');
      const originalText = button.innerHTML;

      button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20,6 9,17 4,12"/>
        </svg>
        Copied!
      `;
      button.classList.add('copied');

      setTimeout(() => {
        button.innerHTML = originalText;
        button.classList.remove('copied');
      }, 2000);
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);

      const button = document.getElementById('copy-button');
      button.textContent = 'Copied!';
      setTimeout(() => {
        button.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          Copy Link
        `;
      }, 2000);
    });
  }

  function calculate() {
    const baseline = parseFloat(document.getElementById('baseline').value);
    const newtime = parseFloat(document.getElementById('newtime').value);
    const results = document.getElementById('results');

    if (!baseline || !newtime || baseline <= 0 || newtime <= 0) {
      results.classList.remove('show');
      return;
    }

    // Update hash with current values
    updateHash();

    // Calculate improvements (assuming lower time is better)
    const improvement = baseline - newtime;
    const difference = Math.abs(improvement);
    const fasterPercent = (difference / newtime * 100).toFixed(2);
    const fasterTimes = (difference / newtime + 1).toFixed(2);
    const timeSavedPercent = (difference / baseline * 100).toFixed(2);

    // Update display
    const fasterPercentEl = document.getElementById('faster-percent');
    const fasterTimesEl = document.getElementById('faster-times');
    const lessTimeEl = document.getElementById('less-time');

    if (improvement > 0) {
      fasterPercentEl.textContent = `${fasterPercent}% faster`;
      fasterPercentEl.className = 'result-value positive';
      fasterTimesEl.textContent = `${fasterTimes}× faster`;
      fasterTimesEl.className = 'result-value positive';
      lessTimeEl.textContent = `${timeSavedPercent}% less time`;
      lessTimeEl.className = 'result-value positive';
    } else if (improvement < 0) {
      fasterPercentEl.textContent = `${Math.abs(fasterPercent)}% slower`;
      fasterPercentEl.className = 'result-value negative';
      fasterTimesEl.textContent = `${fasterTimes}× slower`;
      fasterTimesEl.className = 'result-value negative';
      lessTimeEl.textContent = `${Math.abs(timeSavedPercent)}% more time`;
      lessTimeEl.className = 'result-value negative';
    } else {
      fasterPercentEl.textContent = 'No change';
      fasterPercentEl.className = 'result-value';
      fasterTimesEl.textContent = '1.00× (same)';
      fasterTimesEl.className = 'result-value';
      lessTimeEl.textContent = 'No time saved';
      lessTimeEl.className = 'result-value';
    }

    results.classList.add('show');
  }

  // Initialize on page load
  document.addEventListener('DOMContentLoaded', () => {
    loadFromHash();

    document.getElementById('baseline').addEventListener('input', calculate);
    document.getElementById('newtime').addEventListener('input', calculate);

    // Handle browser back/forward
    window.addEventListener('hashchange', loadFromHash);
  });
</script>

{{< /rawhtml >}}
