# APSER: AI Parameteric Sensitivity Sweep Experiment Runner
A multi-agent AI system that orchestrates end-to-end parametric sweep experiments: converts natural language into structured specifications, performs automated research, generates and executes code, creates visualizations, and produces comprehensive reports.

## Setup

**Prerequisites**: Python 3.9+

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

The main workflow (`src/main.py` or `src/main.ipynb`) orchestrates an 8-step agent pipeline:

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
python run_web.py
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
cd src
python main.py
```

Or use the interactive Jupyter notebook at `src/main.ipynb`.

## Deploy to the Web

### Option 1: Railway (Recommended - Easiest)

1. Push your code to GitHub
2. Go to [railway.app](https://railway.app) and sign up
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your ASPER repository
5. Add environment variable: `OPENAI_API_KEY` = your key
6. Railway will auto-deploy and give you a public URL

### Option 2: Render

1. Push your code to GitHub
2. Go to [render.com](https://render.com) and sign up
3. Click "New" → "Web Service"
4. Connect your GitHub repo
5. Render will detect `render.yaml` automatically
6. Add environment variable: `OPENAI_API_KEY`
7. Click "Create Web Service"

### Option 3: Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login and deploy
fly auth login
fly launch --name your-app-name
fly secrets set OPENAI_API_KEY=your_key_here
fly deploy
```

### Option 4: Docker (Any Cloud Provider)

Build and run the Docker container:

```bash
# Build the image
docker build -t asper .

# Run locally
docker run -p 8080:8080 -e OPENAI_API_KEY=your_key asper

# Push to Docker Hub or your cloud provider's registry
docker tag asper your-registry/asper
docker push your-registry/asper
```

Deploy the container to:
- **Google Cloud Run**: `gcloud run deploy`
- **AWS App Runner**: Push to ECR, create App Runner service
- **Azure Container Apps**: `az containerapp create`
- **DigitalOcean App Platform**: Connect Docker Hub repo

### Option 5: Traditional VPS (Ubuntu)

```bash
# On your server
sudo apt update && sudo apt install python3.11 python3.11-venv nginx

# Clone and setup
git clone https://github.com/your-username/ASPER.git
cd ASPER
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create .env file
echo "OPENAI_API_KEY=your_key" > .env

# Run with gunicorn
gunicorn --bind 0.0.0.0:8080 --workers 2 --threads 4 src.web.app:app

# (Optional) Set up nginx reverse proxy and systemd service for production
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | Your OpenAI API key |
| `SECRET_KEY` | No | Flask secret key (auto-generated if not set) |
| `PORT` | No | Port to run on (default: 8080) |

## Implementation

### Project Structure

```
ASPER/
├── src/
│   ├── main.py              # CLI workflow script
│   ├── main.ipynb           # Interactive notebook version
│   ├── web/                 # Web interface
│   │   ├── app.py           # Flask application
│   │   ├── templates/       # HTML templates
│   │   └── static/          # CSS and JavaScript
│   └── tools/
│       ├── schema.py        # ExperimentSpec schema
│       ├── fileWriter.py    # File writing tool
│       ├── fileReader.py    # File reading tool
│       └── executeCommand.py # Command execution tool
├── AgentPrompts/
│   ├── parser.txt           # Step 1 instructions
│   ├── critic.txt           # Step 2 instructions
│   ├── editor.txt           # Step 3 instructions
│   ├── summarizer.txt       # Step 4 instructions
│   ├── researcher.txt       # Step 5 instructions
│   ├── executor.txt         # Step 6 instructions
│   ├── plotter.txt          # Step 7 instructions
│   └── writer.txt           # Step 8 instructions
├── experiments/             # Output directory for web interface
├── run_web.py               # Web server launcher
└── .env                     # OPENAI_API_KEY
```


