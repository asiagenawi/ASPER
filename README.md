# ASPER: AI Parametric Sensitivity Sweep Experiment Runner

A multi-agent AI system that orchestrates end-to-end parametric sweep experiments: converts natural language into structured specifications, performs automated research, generates and executes code, creates visualizations, and produces comprehensive reports.

## Setup

**Prerequisites**: Python 3.9+ (Python 3.11 recommended for deployment)

1. Clone and navigate to the repository:
```bash
git clone <repository-url>
cd ASPER
```

2. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Configuration

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

## Workflow Logic

The system orchestrates an 8-step agent pipeline:

### Step 1: Parse (`parser.txt`)
- User describes their experiment in plain English
- Parser agent converts natural language into structured `ExperimentSpec` JSON
- Specification saved to `experiment.json`

### Step 2: Critique (`critic.txt`)
- Critic agent reviews the parsed specification
- Identifies ambiguities, missing details, or potential issues
- Generates clarifying questions for the user

### Step 3: Edit (`editor.txt`)
- User provides answers to clarifying questions
- Editor agent updates the specification based on user responses
- Updated specification overwrites `experiment.json`

### Step 4: Summarize (`summarizer.txt`)
- Summarizer agent generates human-readable description
- User confirms understanding of the planned experiment
- Provides checkpoint before expensive operations

### Step 5: Research (`researcher.txt`)
- Researcher agent performs web searches using `WebSearchTool`
- Gathers implementation details, best practices, parameter values
- Research findings saved to `research.txt`

### Step 6: Execute (`executor.txt`)
- Executor agent writes experiment code using `write_file_tool`
- Runs the experiment using `execute_command_tool`
- Outputs experiment results to `results.log`

### Step 7: Plot (`plotter.txt`)
- Plotter agent reads results using `read_file_tool`
- Generates visualizations (e.g., `plot.png`)
- Uses Python plotting libraries via command execution

### Step 8: Write Report (`writer.txt`)
- Writer agent collects all artifacts (results, plots, research)
- Generates comprehensive experiment report
- Final deliverable synthesizing the entire workflow

### Data Flow

```
User Input (natural language)
    ↓
Parser → experiment.json
    ↓
Critic → clarifying questions
    ↓
Editor → updated experiment.json
    ↓
Summarizer → human summary
    ↓
Researcher → research.txt
    ↓
Executor → results.log + experiment code
    ↓
Plotter → plot.png
    ↓
Writer → final report
```

## Usage

### Web Interface (Recommended)

The easiest way to use ASPER is through the web interface:

```bash
python main.py
```

Then open http://localhost:5000 in your browser. The web interface provides:
- Visual progress tracking through all 8 steps
- Interactive clarification input
- Real-time activity log
- Results display with visualizations
- Report viewing with Markdown rendering
- Download all experiment files as a zip

### Command Line Interface

For terminal-based usage:

```bash
python src/main.py
```

Or use the interactive Jupyter notebook at `src/main.ipynb`.

## Docker Deployment

### Quick Start with Docker Compose

The easiest way to run ASPER with Docker:

```bash
# Set your API key
export OPENAI_API_KEY=your_key_here

# Build and run
docker-compose up --build
```

Then open http://localhost:5000 in your browser.

### Manual Docker Commands

```bash
# Build the image
docker build -t asper .

# Run the container
docker run -p 5000:5000 -e OPENAI_API_KEY=your_key_here -v $(pwd)/experiments:/app/experiments asper
```

### Deploy to Cloud Providers

Push to any container registry and deploy:

```bash
# Tag and push to Docker Hub
docker tag asper your-username/asper
docker push your-username/asper
```

Deploy to:
- **Google Cloud Run**: `gcloud run deploy --image your-username/asper`
- **AWS App Runner**: Push to ECR, create App Runner service
- **Azure Container Apps**: `az containerapp create`
- **DigitalOcean App Platform**: Connect Docker Hub repo

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | Your OpenAI API key |
| `SECRET_KEY` | No | Flask secret key (auto-generated if not set) |

## Implementation

### Project Structure

```
ASPER/
├── main.py                  # Flask web application (entry point)
├── Dockerfile               # Docker image configuration
├── docker-compose.yml       # Docker Compose configuration
├── requirements.txt         # Python dependencies
├── .env                     # OPENAI_API_KEY (create this)
├── templates/
│   └── index.html           # Web interface HTML
├── static/
│   ├── css/                 # Stylesheets
│   └── js/                  # JavaScript
├── src/
│   ├── main.py              # CLI workflow script
│   ├── main.ipynb           # Interactive notebook version
│   ├── AgentPrompts/        # Agent instruction files
│   │   ├── parser.txt       # Step 1: Parse specification
│   │   ├── critic.txt       # Step 2: Review specification
│   │   ├── editor.txt       # Step 3: Edit specification
│   │   ├── summarizer.txt   # Step 4: Summarize experiment
│   │   ├── researcher.txt   # Step 5: Conduct research
│   │   ├── executor.txt     # Step 6: Execute experiment
│   │   ├── plotter.txt      # Step 7: Generate plots
│   │   └── writer.txt       # Step 8: Write report
│   └── tools/               # Custom agent tools
│       ├── schema.py        # ExperimentSpec Pydantic model
│       ├── fileWriter.py    # File writing tool
│       ├── fileReader.py    # File reading tool
│       ├── fileLister.py    # File listing tool
│       └── executeCommand.py # Command execution tool
└── experiments/             # Output directory for experiments
```


