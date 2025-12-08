/**
 * Intent Clarification Test Page
 * Simple UI for testing the intent clarification service
 */

import { clarifyIntent } from './services/IntentClarificationService';
import type { IntentResult } from './types/agent';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema, DOMParser as ProseMirrorDOMParser } from 'prosemirror-model';

// Create a minimal schema for testing
const testSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'text*', group: 'block' },
    text: {}
  }
});

// Test scenarios
const scenarios = {
  replacement: {
    transcript: 'Stockholm',
    context: '...I got stuck on this summer. It was a great experience and I learned a lot about...'
  },
  ambiguous: {
    transcript: 'Copenhagen and Berlin',
    context: ''
  },
  'clear-insert': {
    transcript: 'I want to visit Paris next summer',
    context: ''
  },
  'need-context': {
    transcript: 'replace that',
    context: 'something here and...'
  }
};

// DOM elements
const transcriptInput = document.getElementById('transcript') as HTMLInputElement;
const contextTextarea = document.getElementById('context') as HTMLTextAreaElement;
const testBtn = document.getElementById('test-btn') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
const testBtnText = document.getElementById('test-btn-text') as HTMLSpanElement;
const testSpinner = document.getElementById('test-spinner') as HTMLDivElement;
const resultDiv = document.getElementById('result') as HTMLDivElement;

// Initialize
console.log('[IntentTest] Test page initialized');

// Test button handler
testBtn.addEventListener('click', async () => {
  const transcript = transcriptInput.value.trim();
  const context = contextTextarea.value;

  if (!transcript) {
    alert('Please enter a transcript');
    return;
  }

  console.log('[IntentTest] Testing with:', { transcript, context });

  // Show loading state
  testBtn.disabled = true;
  testBtnText.style.display = 'none';
  testSpinner.style.display = 'block';
  resultDiv.classList.remove('show');

  try {
    // Create mock editor view for getMoreContext
    const mockEditorView = createMockEditorView(context);

    // Call intent clarification
    const startTime = Date.now();
    const result = await clarifyIntent(transcript, context, mockEditorView);
    const duration = Date.now() - startTime;

    console.log('[IntentTest] Result:', result);
    console.log('[IntentTest] Duration:', duration + 'ms');

    // Display result
    displayResult(result, duration);
  } catch (error) {
    console.error('[IntentTest] Error:', error);
    displayError(error);
  } finally {
    // Reset button state
    testBtn.disabled = false;
    testBtnText.style.display = 'inline';
    testSpinner.style.display = 'none';
  }
});

// Clear button handler
clearBtn.addEventListener('click', () => {
  transcriptInput.value = '';
  contextTextarea.value = '';
  resultDiv.classList.remove('show');
});

// Scenario button handlers
document.querySelectorAll('[data-scenario]').forEach(button => {
  button.addEventListener('click', (e) => {
    const scenarioKey = (e.currentTarget as HTMLElement).getAttribute('data-scenario');
    if (scenarioKey && scenarios[scenarioKey]) {
      const scenario = scenarios[scenarioKey];
      transcriptInput.value = scenario.transcript;
      contextTextarea.value = scenario.context;
      console.log('[IntentTest] Loaded scenario:', scenarioKey);
    }
  });
});

/**
 * Create a mock EditorView for testing
 */
function createMockEditorView(context: string): EditorView {
  const doc = testSchema.node('doc', null, [
    testSchema.node('paragraph', null, [
      testSchema.text(context + '|CURSOR|' + 'more text here...')
    ])
  ]);

  const state = EditorState.create({
    schema: testSchema,
    doc,
    selection: undefined
  });

  // Create a temporary DOM element
  const container = document.createElement('div');
  container.style.display = 'none';
  document.body.appendChild(container);

  const view = new EditorView(container, {
    state,
    dispatchTransaction: () => {}
  });

  // Set cursor position at the marker
  const cursorPos = context.length;
  const tr = view.state.tr.setSelection(
    EditorState.create({
      schema: testSchema,
      doc: view.state.doc
    }).selection.constructor.near(view.state.doc.resolve(cursorPos))
  );
  view.updateState(view.state.apply(tr));

  return view;
}

/**
 * Display the intent result
 */
function displayResult(result: IntentResult, duration: number): void {
  let html = '';

  if (result.type === 'clear') {
    html += `<div class="result-type clear">✅ Clear Intent</div>`;
    html += `<div class="result-content">`;
    html += `<div class="result-field">`;
    html += `<div class="result-field-label">Intent</div>`;
    html += `<div class="result-field-value">${escapeHtml(result.intent.intent)}</div>`;
    html += `</div>`;
    html += `<div class="result-field">`;
    html += `<div class="result-field-label">Confidence</div>`;
    html += `<div class="result-field-value">`;
    html += `<span class="confidence-badge confidence-${result.intent.confidence}">`;
    html += `${result.intent.confidence.toUpperCase()}`;
    html += `</span>`;
    html += `</div>`;
    html += `</div>`;
    html += `<div class="result-field">`;
    html += `<div class="result-field-label">Reasoning</div>`;
    html += `<div class="result-field-value">${escapeHtml(result.intent.reasoning)}</div>`;
    html += `</div>`;
    html += `</div>`;
  } else if (result.type === 'ambiguous') {
    html += `<div class="result-type ambiguous">❓ Ambiguous Intent</div>`;
    html += `<div class="result-content">`;
    html += `<div class="result-field">`;
    html += `<div class="result-field-label">Question</div>`;
    html += `<div class="result-field-value">${escapeHtml(result.question.question)}</div>`;
    html += `</div>`;
    html += `<div class="result-field">`;
    html += `<div class="result-field-label">Options</div>`;
    html += `<ul class="options-list">`;
    result.question.options.forEach(option => {
      html += `<li><strong>${escapeHtml(option.label)}</strong> (value: ${escapeHtml(option.value)})</li>`;
    });
    html += `</ul>`;
    html += `</div>`;
    html += `</div>`;
  }

  // Add duration and raw JSON
  html += `<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">`;
  html += `<div class="result-field-label">Duration: ${duration}ms</div>`;
  html += `</div>`;
  html += `<details style="margin-top: 16px;">`;
  html += `<summary style="cursor: pointer; font-weight: 600; color: #6b7280; font-size: 12px; text-transform: uppercase;">Raw JSON</summary>`;
  html += `<div class="code-block" style="margin-top: 8px;">${JSON.stringify(result, null, 2)}</div>`;
  html += `</details>`;

  resultDiv.innerHTML = html;
  resultDiv.classList.add('show');
}

/**
 * Display an error
 */
function displayError(error: any): void {
  const html = `
    <div class="result-type error">❌ Error</div>
    <div class="result-content">
      <div class="result-field">
        <div class="result-field-label">Error Message</div>
        <div class="result-field-value" style="color: #dc2626;">
          ${escapeHtml(error?.message || String(error))}
        </div>
      </div>
    </div>
    <details style="margin-top: 16px;">
      <summary style="cursor: pointer; font-weight: 600; color: #6b7280; font-size: 12px; text-transform: uppercase;">Stack Trace</summary>
      <div class="code-block" style="margin-top: 8px;">${escapeHtml(error?.stack || 'No stack trace')}</div>
    </details>
  `;

  resultDiv.innerHTML = html;
  resultDiv.classList.add('show');
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
