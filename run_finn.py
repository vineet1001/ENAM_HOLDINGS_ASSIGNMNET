"""Single-command launcher for FINN: starts FastAPI backend and Next.js frontend."""
import os
import sys
import subprocess
import time

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
FRONTEND_DIR = os.path.join(ROOT_DIR, "frontend")

def main():
    print("=" * 65)
    print("  FINN: Financial Investment Intelligence Agent")
    print("  ENAM Holdings AI Engineer Build Challenge | IIT Screening 2027")
    print("=" * 65)

    # 1. Initialize and seed DB
    print("\n[1/3] Initializing SQLite database and verifying seed data...")
    seed_cmd = [sys.executable, os.path.join(BACKEND_DIR, "run_seed.py")]
    try:
        subprocess.run(seed_cmd, check=True)
    except Exception as e:
        print(f"Warning during seed check: {e}")

    # 2. Launch FastAPI backend
    print("\n[2/3] Launching FastAPI backend on http://localhost:8000 ...")
    backend_env = os.environ.copy()
    backend_env["PYTHONPATH"] = BACKEND_DIR
    backend_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"],
        cwd=BACKEND_DIR,
        env=backend_env
    )

    time.sleep(2)

    # 3. Launch Next.js frontend
    print("\n[3/3] Launching Next.js frontend on http://localhost:3000 ...")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    
    # Check if production build exists, else use dev mode
    has_build = os.path.isdir(os.path.join(FRONTEND_DIR, ".next"))
    run_mode = "start" if has_build else "dev"
    print(f"Starting Next.js using 'npm run {run_mode}'...")
    
    frontend_process = subprocess.Popen(
        [npm_cmd, "run", run_mode],
        cwd=FRONTEND_DIR,
        shell=(os.name == "nt")
    )

    print("\n" + "=" * 65)
    print("🚀 FINN is running and accessible!")
    print("• Web Interface:       http://localhost:3000")
    print("• API Swagger Docs:    http://localhost:8000/docs")
    print("• API Health Endpoint: http://localhost:8000/api/health")
    print("=" * 65)
    print("Press Ctrl+C to stop both servers.\n")

    try:
        frontend_process.wait()
    except KeyboardInterrupt:
        print("\nShutting down servers...")
        frontend_process.terminate()
        backend_process.terminate()
        print("Shutdown complete.")

if __name__ == "__main__":
    main()
