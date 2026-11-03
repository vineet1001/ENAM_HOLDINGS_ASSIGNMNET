"""Single-command launcher for FINN: starts FastAPI backend and Next.js frontend."""
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
FRONTEND_DIR = os.path.join(ROOT_DIR, "frontend")
STARTUP_SECONDS = 90


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(1)
        return probe.connect_ex(("127.0.0.1", port)) == 0


def wait_until_up(url: str, process: subprocess.Popen) -> bool:
    """True once the URL answers. False if the process dies or it takes too long."""
    deadline = time.time() + STARTUP_SECONDS
    while time.time() < deadline:
        if process.poll() is not None:
            return False
        try:
            urllib.request.urlopen(url, timeout=3)
            return True
        except urllib.error.HTTPError:
            return True  # It answered, so it's up.
        except OSError:
            time.sleep(1)
    return False


def stop(*processes: subprocess.Popen) -> None:
    for process in processes:
        if process.poll() is None:
            if os.name == "nt":
                # npm starts children of its own, which terminate() would leave running.
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True)
            else:
                process.terminate()


def main() -> int:
    print("=" * 65)
    print("  FINN: Financial Investment Intelligence Agent")
    print("=" * 65)

    busy = [port for port in (8000, 3000) if port_in_use(port)]
    if busy:
        print(f"\nPort {' and '.join(map(str, busy))} already in use. FINN may already be running.")
        print("Open http://localhost:3000, or stop whatever is using the port and try again.")
        return 1

    print("\n[1/3] Preparing the database...")
    try:
        subprocess.run([sys.executable, os.path.join(BACKEND_DIR, "run_seed.py")], check=True)
    except subprocess.CalledProcessError as exc:
        print(f"Warning: database setup reported a problem ({exc}).")

    print("\n[2/3] Starting the backend on http://localhost:8000 ...")
    backend_env = os.environ.copy()
    backend_env["PYTHONPATH"] = BACKEND_DIR
    backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"],
        cwd=BACKEND_DIR,
        env=backend_env,
    )
    if not wait_until_up("http://127.0.0.1:8000/api/health", backend):
        print("\nThe backend didn't start. Check the errors above.")
        stop(backend)
        return 1

    has_build = os.path.isfile(os.path.join(FRONTEND_DIR, ".next", "BUILD_ID"))
    run_mode = "start" if has_build else "dev"
    print(f"\n[3/3] Starting the frontend on http://localhost:3000 (npm run {run_mode}) ...")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    frontend = subprocess.Popen([npm_cmd, "run", run_mode], cwd=FRONTEND_DIR, shell=(os.name == "nt"))
    if not wait_until_up("http://127.0.0.1:3000/", frontend):
        print("\nThe frontend didn't start. Check the errors above. Run 'npm install' in frontend/ if it's a first run.")
        stop(frontend, backend)
        return 1

    print("\n" + "=" * 65)
    print("FINN is running.")
    print("  App:      http://localhost:3000")
    print("  API docs: http://localhost:8000/docs")
    print("=" * 65)
    print("Press Ctrl+C to stop both servers.\n")

    try:
        while backend.poll() is None and frontend.poll() is None:
            time.sleep(1)
        print("\nOne of the servers stopped, so FINN is shutting down.")
    except KeyboardInterrupt:
        print("\nShutting down...")
    stop(frontend, backend)
    return 0


if __name__ == "__main__":
    sys.exit(main())
