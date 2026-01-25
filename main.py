#!/usr/bin/env python3
"""
ASPER Web Interface
A Flask-based web application for the AI Parametric Sensitivity Sweep Experiment Runner.
"""

import asyncio
import json
import os
import uuid
from pathlib import Path
from threading import Thread
from queue import Queue
from datetime import datetime

from flask import Flask, render_template, request, jsonify, Response, send_file
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add src directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent / "src"))
sys.path.insert(0, str(Path(__file__).parent / "src" / "tools"))

from langchain_openai import ChatOpenAI
from agents import Agent, Runner, AgentOutputSchema
from agents.tool import WebSearchTool
from tools.schema import ExperimentSpec
from tools.fileWriter import write_file_tool
from tools.executeCommand import execute_command_tool
from tools.fileReader import read_file_tool

# Create Flask app with explicit paths for production deployment
BASE_DIR = Path(__file__).parent.resolve()
app = Flask(
    __name__,
    static_folder=str(BASE_DIR / "static"),
    template_folder=str(BASE_DIR / "templates")
)

# Production configuration
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', os.urandom(24).hex())
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload

# Enable CORS for API endpoints
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    return response

# Store experiment sessions
sessions = {}

# Directory for experiment outputs
OUTPUT_DIR = Path(__file__).parent / "experiments"
OUTPUT_DIR.mkdir(exist_ok=True)

# Agent prompts directory
PROMPTS_DIR = Path(__file__).parent / "src" / "AgentPrompts"


class ExperimentSession:
    """Manages a single experiment workflow session."""

    def __init__(self, session_id: str, api_key: str):
        self.session_id = session_id
        self.api_key = api_key  # User's OpenAI API key
        self.output_dir = OUTPUT_DIR / session_id
        self.output_dir.mkdir(exist_ok=True)
        self.status = "initialized"
        self.current_step = 0
        self.steps = [
            "Parsing Specification",
            "Reviewing Specification",
            "Awaiting Clarification",
            "Updating Specification",
            "Summarizing Experiment",
            "Conducting Research",
            "Executing Experiment",
            "Plotting Results",
            "Writing Report"
        ]
        self.messages = Queue()
        self.spec = None
        self.critic_questions = None
        self.summary = None
        self.awaiting_input = False
        self.experiment_description = None
        self.error = None

    def add_message(self, msg_type: str, content: str):
        """Add a message to the session queue."""
        self.messages.put({
            "type": msg_type,
            "content": content,
            "timestamp": datetime.now().isoformat(),
            "step": self.current_step
        })

    def get_file_path(self, filename: str) -> Path:
        """Get path for a file in the session output directory."""
        return self.output_dir / filename


def load_prompt(name: str) -> str:
    """Load an agent prompt from file."""
    return (PROMPTS_DIR / f"{name}.txt").read_text(encoding="utf-8")


async def run_experiment_workflow(session: ExperimentSession, user_text: str):
    """Run the complete experiment workflow asynchronously."""
    try:
        # Change to session output directory for file operations
        original_dir = os.getcwd()
        os.chdir(session.output_dir)

        # Set the API key for this session
        os.environ['OPENAI_API_KEY'] = session.api_key

        # Step 1: Parse experiment specification
        session.current_step = 0
        session.status = "running"
        session.add_message("step", "Parsing your experiment description...")

        parser = Agent(
            name='Experiment Specification Parser',
            instructions=load_prompt("parser"),
            output_type=AgentOutputSchema(ExperimentSpec, strict_json_schema=False),
            model='gpt-4o'
        )

        parser_result = await Runner.run(parser, user_text)
        session.spec = parser_result.final_output
        spec_json = session.spec.model_dump_json(indent=2)

        with open("experiment.json", "w") as f:
            f.write(spec_json)

        session.add_message("success", "Experiment specification parsed successfully")
        session.add_message("data", json.dumps({"type": "spec", "content": json.loads(spec_json)}))

        # Step 2: Review specification (Critic)
        session.current_step = 1
        session.add_message("step", "Reviewing specification for potential issues...")

        critic = Agent(
            name='Spec Critic',
            instructions=load_prompt("critic"),
            model='gpt-4o',
        )

        critic_result = await Runner.run(critic, spec_json)
        session.critic_questions = critic_result.final_output

        # Step 3: Await user clarification
        session.current_step = 2
        session.awaiting_input = True
        session.add_message("questions", session.critic_questions)
        session.add_message("info", "Please answer the clarifying questions above")

        # Wait for user response (will be resumed by handle_clarification)
        while session.awaiting_input:
            await asyncio.sleep(0.5)

        # Step 4: Update specification based on user response
        session.current_step = 3
        session.add_message("step", "Updating specification based on your responses...")

        editor_instructions = f'''
You are an experiment specification editor.

Task:
Given:
    (1) an existing experiment specification JSON: {session.spec.model_dump_json(indent=2)}
    (2) clarification questions that were asked to the user: {session.critic_questions}
    (3) the user's answers to those questions, which will be provided to you as input
produce an UPDATED experiment specification JSON.
{load_prompt("editor")}
'''

        editor = Agent(
            name="Experiment Spec Editor",
            instructions=editor_instructions,
            model='gpt-4o',
            output_type=AgentOutputSchema(ExperimentSpec, strict_json_schema=False),
        )

        editor_result = await Runner.run(editor, session.user_clarification)
        session.spec = editor_result.final_output
        spec_json = session.spec.model_dump_json(indent=2)

        with open("experiment.json", "w") as f:
            f.write(spec_json)

        session.add_message("success", "Specification updated successfully")
        session.add_message("data", json.dumps({"type": "spec_updated", "content": json.loads(spec_json)}))

        # Step 5: Summarize experiment
        session.current_step = 4
        session.add_message("step", "Creating experiment summary...")

        summarizer = Agent(
            name='Experiment Summarizer',
            instructions=load_prompt("summarizer"),
            model='gpt-4o'
        )

        summarizer_result = await Runner.run(summarizer, spec_json)
        session.summary = summarizer_result.final_output
        session.add_message("summary", session.summary)

        # Step 6: Research
        session.current_step = 5
        session.add_message("step", "Conducting background research...")

        researcher = Agent(
            name='Experiment Researcher',
            instructions=load_prompt("researcher"),
            model='gpt-4o',
            tools=[WebSearchTool()]
        )

        researcher_result = await Runner.run(researcher, spec_json)

        with open("research.txt", "w") as f:
            f.write(researcher_result.final_output)

        session.add_message("success", "Research completed and saved")

        # Step 7: Execute experiment
        session.current_step = 6
        session.add_message("step", "Generating and executing experiment code...")

        executor = Agent(
            name='Experiment Executor',
            instructions=load_prompt("executor"),
            model='gpt-4o',
            tools=[write_file_tool, execute_command_tool]
        )

        executor_result = await Runner.run(executor, researcher_result.final_output)
        session.add_message("success", f"Experiment executed: {executor_result.final_output}")

        # Step 8: Plot results
        session.current_step = 7
        session.add_message("step", "Generating visualizations...")

        plotter = Agent(
            name='Results Plotter',
            instructions=load_prompt("plotter"),
            model='gpt-4o',
            tools=[read_file_tool, write_file_tool, execute_command_tool]
        )

        plot_result = await Runner.run(plotter, "results.log")
        session.add_message("success", "Visualizations created")

        if (session.output_dir / "plot.png").exists():
            session.add_message("data", json.dumps({"type": "plot", "path": "plot.png"}))

        # Step 9: Write report
        session.current_step = 8
        session.add_message("step", "Writing final report...")

        writer = Agent(
            name='Report Writer',
            instructions=load_prompt("writer"),
            tools=[write_file_tool, read_file_tool]
        )

        files = f"results.log, experiment.json, research.txt, plot.png, {executor_result.final_output}"
        report_result = await Runner.run(writer, files)

        session.add_message("success", "Report generated successfully")

        if (session.output_dir / "report.md").exists():
            report_content = (session.output_dir / "report.md").read_text()
            session.add_message("data", json.dumps({"type": "report", "content": report_content}))

        session.status = "completed"
        session.add_message("complete", "Experiment workflow completed successfully!")

    except Exception as e:
        session.error = str(e)
        session.status = "error"
        session.add_message("error", f"Error: {str(e)}")
        import traceback
        session.add_message("error", traceback.format_exc())
    finally:
        os.chdir(original_dir)


def run_async_workflow(session: ExperimentSession, user_text: str):
    """Run the async workflow in a new event loop."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(run_experiment_workflow(session, user_text))
    finally:
        loop.close()


@app.route('/')
def index():
    """Render the main page."""
    return render_template('index.html')


@app.route('/health')
def health():
    """Health check endpoint for cloud deployments."""
    return jsonify({"status": "healthy", "service": "asper"})


@app.route('/api/start', methods=['POST'])
def start_experiment():
    """Start a new experiment workflow."""
    data = request.get_json()
    api_key = data.get('api_key', '')
    user_text = data.get('description', '')

    # Validate API key
    if not api_key or not api_key.strip():
        return jsonify({"error": "Please provide your OpenAI API key"}), 400

    if not api_key.startswith('sk-'):
        return jsonify({"error": "Invalid API key format"}), 400

    if not user_text.strip():
        return jsonify({"error": "Please provide an experiment description"}), 400

    # Create new session with user's API key
    session_id = str(uuid.uuid4())[:8]
    session = ExperimentSession(session_id, api_key)
    session.experiment_description = user_text
    sessions[session_id] = session

    # Start workflow in background thread
    thread = Thread(target=run_async_workflow, args=(session, user_text))
    thread.daemon = True
    thread.start()

    return jsonify({"session_id": session_id})


@app.route('/api/clarify/<session_id>', methods=['POST'])
def handle_clarification(session_id: str):
    """Handle user clarification response."""
    if session_id not in sessions:
        return jsonify({"error": "Session not found"}), 404

    session = sessions[session_id]
    data = request.get_json()
    session.user_clarification = data.get('response', '')
    session.awaiting_input = False

    return jsonify({"status": "ok"})


@app.route('/api/status/<session_id>')
def get_status(session_id: str):
    """Get current status of an experiment session."""
    if session_id not in sessions:
        return jsonify({"error": "Session not found"}), 404

    session = sessions[session_id]
    return jsonify({
        "status": session.status,
        "current_step": session.current_step,
        "steps": session.steps,
        "awaiting_input": session.awaiting_input,
        "error": session.error
    })


@app.route('/api/events/<session_id>')
def stream_events(session_id: str):
    """Stream events for a session using Server-Sent Events."""
    if session_id not in sessions:
        return jsonify({"error": "Session not found"}), 404

    session = sessions[session_id]

    def generate():
        while True:
            try:
                # Non-blocking get with timeout
                import queue
                try:
                    msg = session.messages.get(timeout=1)
                    yield f"data: {json.dumps(msg)}\n\n"
                except queue.Empty:
                    # Send heartbeat
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"

                if session.status in ["completed", "error"]:
                    yield f"data: {json.dumps({'type': 'done', 'status': session.status})}\n\n"
                    break

            except GeneratorExit:
                break

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        }
    )


@app.route('/api/files/<session_id>/<filename>')
def get_file(session_id: str, filename: str):
    """Get a file from the session output directory."""
    # Security: validate session_id format (alphanumeric only)
    if not session_id.isalnum():
        return jsonify({"error": "Invalid session ID"}), 400

    # Security: prevent path traversal
    if '..' in filename or '/' in filename:
        return jsonify({"error": "Invalid filename"}), 400

    # Check in session first, then fall back to disk
    if session_id in sessions:
        file_path = sessions[session_id].output_dir / filename
    else:
        # Session not in memory, try to find on disk
        file_path = OUTPUT_DIR / session_id / filename

    if not file_path.exists():
        return jsonify({"error": "File not found"}), 404

    # Determine mimetype
    if filename.endswith('.png'):
        mimetype = 'image/png'
    elif filename.endswith('.jpg') or filename.endswith('.jpeg'):
        mimetype = 'image/jpeg'
    elif filename.endswith('.json'):
        mimetype = 'application/json'
    elif filename.endswith('.md'):
        mimetype = 'text/markdown'
    elif filename.endswith('.py'):
        mimetype = 'text/x-python'
    else:
        mimetype = 'text/plain'

    return send_file(file_path, mimetype=mimetype)


@app.route('/api/download/<session_id>')
def download_all(session_id: str):
    """Download all experiment files as a zip."""
    import zipfile
    import io

    # Security: validate session_id format
    if not session_id.isalnum():
        return jsonify({"error": "Invalid session ID"}), 400

    # Get output directory from session or disk
    if session_id in sessions:
        output_dir = sessions[session_id].output_dir
    else:
        output_dir = OUTPUT_DIR / session_id

    if not output_dir.exists():
        return jsonify({"error": "Session not found"}), 404

    # Create zip in memory
    memory_file = io.BytesIO()
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        for file_path in output_dir.iterdir():
            if file_path.is_file():
                zf.write(file_path, file_path.name)

    memory_file.seek(0)

    return send_file(
        memory_file,
        mimetype='application/zip',
        as_attachment=True,
        download_name=f'experiment_{session_id}.zip'
    )


@app.route('/api/sessions')
def list_sessions():
    """List all sessions."""
    return jsonify({
        session_id: {
            "status": s.status,
            "current_step": s.current_step,
            "description": s.experiment_description[:100] + "..." if s.experiment_description and len(s.experiment_description) > 100 else s.experiment_description
        }
        for session_id, s in sessions.items()
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)




