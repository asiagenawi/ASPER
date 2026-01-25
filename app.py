#!/usr/bin/env python3
"""
Convenience script to run the ASPER web interface.
"""

import os
import sys

# Add project root to path
project_root = os.path.dirname(__file__)
sys.path.insert(0, project_root)
sys.path.insert(0, os.path.join(project_root, 'src'))

# Change to project root for proper imports
os.chdir(project_root)

from web.app import app

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))

    print("\n" + "=" * 50)
    print("  ASPER - AI Parametric Sweep Experiment Runner")
    print("=" * 50)
    print(f"\n  Web interface starting...")
    print(f"  Open http://localhost:{port} in your browser\n")
    print("  Press Ctrl+C to stop the server\n")
    print("=" * 50 + "\n")

    app.run(debug=True, host='0.0.0.0', port=port, threaded=True, use_reloader=False)
