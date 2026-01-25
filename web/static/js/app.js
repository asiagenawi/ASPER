/**
 * ASPER Web Interface - JavaScript Application
 */

class ASPERApp {
    constructor() {
        this.sessionId = null;
        this.eventSource = null;
        this.currentStep = -1;
        this.apiKey = null;

        // DOM Elements
        this.elements = {
            inputSection: document.getElementById('input-section'),
            progressSection: document.getElementById('progress-section'),
            clarificationSection: document.getElementById('clarification-section'),
            logSection: document.getElementById('log-section'),
            resultsSection: document.getElementById('results-section'),
            errorSection: document.getElementById('error-section'),
            apiKeyInput: document.getElementById('api-key-input'),
            experimentInput: document.getElementById('experiment-input'),
            startBtn: document.getElementById('start-btn'),
            clarificationInput: document.getElementById('clarification-input'),
            submitClarification: document.getElementById('submit-clarification'),
            questionsContainer: document.getElementById('questions-container'),
            logContainer: document.getElementById('log-container'),
            summaryContent: document.getElementById('summary-content'),
            specContent: document.getElementById('spec-content'),
            plotContainer: document.getElementById('plot-container'),
            reportContent: document.getElementById('report-content'),
            errorContent: document.getElementById('error-content'),
            downloadBtn: document.getElementById('download-btn'),
            newExperimentBtn: document.getElementById('new-experiment-btn'),
            retryBtn: document.getElementById('retry-btn')
        };

        this.initializeEventListeners();
        this.initializeTabs();
        this.initializeExamples();
        this.loadSavedApiKey();
    }

    loadSavedApiKey() {
        // Load API key from localStorage if previously saved
        const savedKey = localStorage.getItem('openai_api_key');
        if (savedKey) {
            this.elements.apiKeyInput.value = savedKey;
        }
    }

    saveApiKey(key) {
        // Save API key to localStorage for convenience
        if (key && key.startsWith('sk-')) {
            localStorage.setItem('openai_api_key', key);
        }
    }

    initializeEventListeners() {
        // Start experiment
        this.elements.startBtn.addEventListener('click', () => this.startExperiment());

        // Submit clarification
        this.elements.submitClarification.addEventListener('click', () => this.submitClarification());

        // Download button
        this.elements.downloadBtn.addEventListener('click', () => this.downloadFiles());

        // New experiment button
        this.elements.newExperimentBtn.addEventListener('click', () => this.resetToStart());

        // Retry button
        this.elements.retryBtn.addEventListener('click', () => this.resetToStart());

        // Allow Enter key in textarea (Shift+Enter for new line)
        this.elements.experimentInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                this.startExperiment();
            }
        });

        this.elements.clarificationInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                this.submitClarification();
            }
        });
    }

    initializeTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;

                // Update button states
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update tab panes
                document.querySelectorAll('.tab-pane').forEach(pane => {
                    pane.classList.remove('active');
                });
                document.getElementById(`${tabName}-tab`).classList.add('active');
            });
        });
    }

initializeExamples() {
    const examples = {
        physics: `I want to simulate a damped harmonic oscillator to see how changing the damping and the spring stiffness affects its motion.

Parameters to explore:
- Damping coefficient: from 0.1 to 2.0 in steps of 0.1
- Spring constant: from 1.0 to 10.0 in steps of 1.0

What I will measure:
- Decay time: how long it takes for the amplitude to drop below 1% of the initial value
- Number of oscillations: how many times the system swings before the amplitude becomes very small

Use a grid search over the parameter ranges to systematically explore all combinations. The goal is 
to understand how damping and spring stiffness influence how fast the system slows down and how many oscillations it completes.`,

        optimization: `I want to minimize the Rastrigin function in two dimensions and compare how different optimization 
methods perform. The Rastrigin function has many local minima, so it’s interesting to see which methods can find the global minimum.

Parameters to explore:
- x (dimension 1): from -5.12 to 5.12
- y (dimension 2): from -5.12 to 5.12

Experiment Setup:
- Use a grid search with 50 points along each dimension, creating a 50x50 grid across the x-y plane.
- Evaluate the Rastrigin function at each grid point.

Metrics to Record:
- Function value at the minimum – how low the function can go
- Location of the minimum – the x and y coordinates where the minimum occurs

Goal:
- Compare how well grid search identifies the global minimum of the Rastrigin function.
- Analyze the accuracy and coverage of the grid search compared to the known global minimum at (0, 0).`
    };

    document.querySelectorAll('.example-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const exampleType = btn.dataset.example;
            if (examples[exampleType]) {
                this.elements.experimentInput.value = examples[exampleType].trim();
                this.elements.experimentInput.focus();
            }
        });
    });
}

    async startExperiment() {
        const apiKey = this.elements.apiKeyInput.value.trim();
        const description = this.elements.experimentInput.value.trim();

        if (!apiKey) {
            this.showError('Please enter your OpenAI API key');
            this.elements.apiKeyInput.focus();
            return;
        }

        if (!apiKey.startsWith('sk-')) {
            this.showError('Invalid API key format. OpenAI keys start with "sk-"');
            this.elements.apiKeyInput.focus();
            return;
        }

        if (!description) {
            this.showError('Please enter an experiment description');
            this.elements.experimentInput.focus();
            return;
        }

        // Save API key for convenience
        this.apiKey = apiKey;
        this.saveApiKey(apiKey);

        // Disable button and show loading
        this.elements.startBtn.disabled = true;
        this.elements.startBtn.innerHTML = '<span class="spinner"></span> Starting...';

        try {
            const response = await fetch('/api/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description, api_key: apiKey })
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            this.sessionId = data.session_id;

            // Show progress section
            this.elements.inputSection.classList.add('hidden');
            this.elements.progressSection.classList.remove('hidden');
            this.elements.logSection.classList.remove('hidden');

            // Start listening for events
            this.connectEventStream();

        } catch (error) {
            this.showError(error.message);
            this.resetStartButton();
        }
    }

    connectEventStream() {
        if (this.eventSource) {
            this.eventSource.close();
        }

        this.eventSource = new EventSource(`/api/events/${this.sessionId}`);

        this.eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleEvent(data);
        };

        this.eventSource.onerror = () => {
            // Reconnect after a delay
            setTimeout(() => {
                if (this.eventSource && this.eventSource.readyState === EventSource.CLOSED) {
                    this.connectEventStream();
                }
            }, 1000);
        };
    }

    handleEvent(data) {
        // Log all events except heartbeats for debugging
        if (data.type !== 'heartbeat') {
            console.log('Event received:', data.type, data);
        }

        switch (data.type) {
            case 'heartbeat':
                // Ignore heartbeats
                break;

            case 'step':
                this.addLogEntry(data.content, 'step');
                this.updateProgress(data.step);
                break;

            case 'success':
                this.addLogEntry(data.content, 'success');
                this.markStepCompleted(data.step);
                break;

            case 'info':
                this.addLogEntry(data.content, 'info');
                break;

            case 'error':
                this.addLogEntry(data.content, 'error');
                break;

            case 'questions':
                this.showClarificationSection(data.content);
                break;

            case 'summary':
                this.elements.summaryContent.textContent = data.content;
                break;

            case 'data':
                try {
                    const parsed = JSON.parse(data.content);
                    console.log('Data event:', parsed.type);
                    this.handleDataEvent(parsed);
                } catch (e) {
                    console.error('Error parsing data event:', e, data.content);
                }
                break;

            case 'complete':
                this.addLogEntry(data.content, 'success');
                this.onWorkflowComplete();
                break;

            case 'done':
                if (data.status === 'error') {
                    this.onWorkflowError();
                } else if (data.status === 'completed') {
                    this.onWorkflowComplete();
                }
                this.eventSource.close();
                break;
        }
    }

    handleDataEvent(data) {
        switch (data.type) {
            case 'spec':
            case 'spec_updated':
                this.elements.specContent.textContent = JSON.stringify(data.content, null, 2);
                break;

            case 'plot':
                this.elements.plotContainer.innerHTML = `<img src="/api/files/${this.sessionId}/${data.path}" alt="Experiment Plot">`;
                break;

            case 'report':
                console.log('Report received, length:', data.content?.length);
                try {
                    if (typeof marked !== 'undefined') {
                        this.elements.reportContent.innerHTML = marked.parse(data.content);
                    } else {
                        this.elements.reportContent.textContent = data.content;
                    }
                } catch (e) {
                    console.error('Error rendering report:', e);
                    this.elements.reportContent.textContent = data.content;
                }
                break;
        }
    }

    updateProgress(stepIndex) {
        this.currentStep = stepIndex;

        document.querySelectorAll('.step').forEach((step, idx) => {
            step.classList.remove('active');
            if (idx < stepIndex) {
                step.classList.add('completed');
            } else if (idx === stepIndex) {
                step.classList.add('active');
            }
        });
    }

    markStepCompleted(stepIndex) {
        const step = document.querySelector(`.step[data-step="${stepIndex}"]`);
        if (step) {
            step.classList.remove('active');
            step.classList.add('completed');
        }
    }

    showClarificationSection(questions) {
        this.elements.clarificationSection.classList.remove('hidden');
        this.elements.questionsContainer.textContent = questions;
        this.elements.clarificationInput.focus();
    }

    async submitClarification() {
        const response = this.elements.clarificationInput.value.trim();

        if (!response) {
            alert('Please provide your answers');
            return;
        }

        this.elements.submitClarification.disabled = true;
        this.elements.submitClarification.innerHTML = '<span class="spinner"></span> Submitting...';

        try {
            const res = await fetch(`/api/clarify/${this.sessionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ response })
            });

            const data = await res.json();

            if (data.error) {
                throw new Error(data.error);
            }

            // Hide clarification section
            this.elements.clarificationSection.classList.add('hidden');
            this.markStepCompleted(2);

        } catch (error) {
            alert('Error submitting clarification: ' + error.message);
        } finally {
            this.elements.submitClarification.disabled = false;
            this.elements.submitClarification.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                Submit Answers
            `;
        }
    }

    addLogEntry(content, type = 'info') {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;

        const timestamp = new Date().toLocaleTimeString();
        entry.innerHTML = `<span class="timestamp">[${timestamp}]</span> <span>${this.escapeHtml(content)}</span>`;

        this.elements.logContainer.appendChild(entry);
        this.elements.logContainer.scrollTop = this.elements.logContainer.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    onWorkflowComplete() {
        console.log('Workflow complete - showing results');

        // Mark all steps as completed
        document.querySelectorAll('.step').forEach(step => {
            step.classList.remove('active');
            step.classList.add('completed');
        });

        // Hide visualization tab by default until we know if plot exists
        this.showVisualizationTab(false);

        // Show results section
        this.elements.resultsSection.classList.remove('hidden');

        // Load files that might have been missed
        this.loadResultFiles();

        // Scroll to results
        this.elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
    }

    async loadResultFiles() {
        console.log('Loading result files for session:', this.sessionId);

        // Load report if not already loaded
        if (!this.elements.reportContent.innerHTML || this.elements.reportContent.innerHTML.trim() === '') {
            try {
                const response = await fetch(`/api/files/${this.sessionId}/report.md`);
                if (response.ok) {
                    const content = await response.text();
                    if (typeof marked !== 'undefined') {
                        this.elements.reportContent.innerHTML = marked.parse(content);
                    } else {
                        this.elements.reportContent.textContent = content;
                    }
                    console.log('Report loaded from API');
                }
            } catch (e) {
                console.log('Could not load report:', e);
            }
        }

        // Load plot if not already loaded
        if (!this.elements.plotContainer.querySelector('img')) {
            const plotUrl = `/api/files/${this.sessionId}/plot.png`;
            console.log('Attempting to load plot from:', plotUrl);

            const img = document.createElement('img');
            img.src = plotUrl;
            img.alt = 'Experiment Plot';
            img.onload = () => {
                console.log('Plot loaded successfully');
                this.showVisualizationTab(true);
                this.addPlotToReport(plotUrl);
            };
            img.onerror = () => {
                console.log('Plot not available - hiding visualization tab');
                this.showVisualizationTab(false);
            };

            this.elements.plotContainer.innerHTML = '';
            this.elements.plotContainer.appendChild(img);
        }
    }

    showVisualizationTab(show) {
        const vizTab = document.querySelector('.tab-btn[data-tab="plot"]');
        const vizPane = document.getElementById('plot-tab');

        if (vizTab) {
            vizTab.style.display = show ? '' : 'none';
        }

        // If hiding and currently active, switch to another tab
        if (!show && vizTab && vizTab.classList.contains('active')) {
            document.querySelector('.tab-btn[data-tab="summary"]').click();
        }
    }

    addPlotToReport(plotUrl) {
        // Add plot image to the report tab if not already there
        if (!this.elements.reportContent.querySelector('.report-plot')) {
            const plotSection = document.createElement('div');
            plotSection.className = 'report-plot';
            plotSection.innerHTML = `
                <h2>Visualization</h2>
                <img src="${plotUrl}" alt="Experiment Plot">
            `;
            this.elements.reportContent.appendChild(plotSection);
            console.log('Plot added to report');
        }
    }

    onWorkflowError() {
        // Get last error from log
        const lastError = this.elements.logContainer.querySelector('.log-entry.error:last-child');
        if (lastError) {
            this.elements.errorContent.textContent = lastError.textContent;
        }
        this.elements.errorSection.classList.remove('hidden');
    }

    showError(message) {
        this.elements.errorContent.textContent = message;
        this.elements.errorSection.classList.remove('hidden');
    }

    downloadFiles() {
        if (this.sessionId) {
            window.location.href = `/api/download/${this.sessionId}`;
        }
    }

    resetToStart() {
        // Close event stream
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        // Reset session
        this.sessionId = null;
        this.currentStep = -1;

        // Reset UI
        this.elements.inputSection.classList.remove('hidden');
        this.elements.progressSection.classList.add('hidden');
        this.elements.clarificationSection.classList.add('hidden');
        this.elements.logSection.classList.add('hidden');
        this.elements.resultsSection.classList.add('hidden');
        this.elements.errorSection.classList.add('hidden');

        // Reset progress steps
        document.querySelectorAll('.step').forEach(step => {
            step.classList.remove('active', 'completed');
        });

        // Clear log
        this.elements.logContainer.innerHTML = '';

        // Clear results
        this.elements.summaryContent.textContent = '';
        this.elements.specContent.textContent = '';
        this.elements.plotContainer.innerHTML = '<p class="placeholder">Plot will appear here</p>';
        this.elements.reportContent.innerHTML = '';

        // Reset clarification input
        this.elements.clarificationInput.value = '';

        // Reset start button
        this.resetStartButton();

        // Focus on input
        this.elements.experimentInput.focus();
    }

    resetStartButton() {
        this.elements.startBtn.disabled = false;
        this.elements.startBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Start Experiment
        `;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.asperApp = new ASPERApp();
});

from flask import Flask, render_template

app = Flask(__name__)

@app.route("/")
def home():
    return render_template("index.html") 
import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)

