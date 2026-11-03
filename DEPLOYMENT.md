# Running and deploying FINN

## Run it locally

Needs Python 3.11+ and Node 20+.

```bash
pip install -r backend/requirements.txt
cd frontend && npm install && npm run build && cd ..
python run_finn.py
```

Open http://localhost:3000. Prices, filings, reported financials and alerts work straight away. To turn on AI reading, add a key under **Settings**. It takes effect without a restart.

The OCR packages, `rapidocr-onnxruntime` and `pypdfium2`, add about 190 MB, mostly OpenCV. Without them, scanned filings are reported as unreadable and everything else works.

`run_finn.py` stops with a clear message if port 3000 or 8000 is taken, or if a server fails to start.

## Docker

```bash
docker compose up --build
```

The database, downloaded document text and saved keys all live in `./backend/data`. Set `FINN_ADMIN_TOKEN` in your shell first if you want to change AI keys from the browser, because requests through the container network don't count as local.

These Docker files haven't been run yet, because the machine this was built on has no Docker.

## Fastest: one container on Render

`Dockerfile` and `render.yaml` at the root run the website and the backend in one container. Next.js serves the site and forwards `/api` to the backend inside it.

1. Sign in at render.com with GitHub.
2. Choose **New > Blueprint** and pick this repository.
3. Paste a Gemini key when Render asks for `GEMINI_API_KEY`, then click **Apply**. The first build takes about 10 minutes.

The free plan sleeps after 15 minutes with no visitors, so the first visit afterwards takes about a minute. It also has no disk: portfolios and AI answers saved on the hosted copy reset whenever the service restarts, and it starts again from the database in the repository. The free plan has 512 MB of memory. If reading large annual reports restarts the service, move to the Starter plan.

## Hosting it

FINN is one long-running Python process with background jobs and a SQLite file, so the backend needs a host that keeps a process alive and has a persistent disk, such as Render or Railway. Serverless functions won't work for the backend.

1. **Backend:** deploy `Dockerfile.backend` with a disk mounted at `/app/data`. Set `FINN_ENV_FILE=/app/data/.env` and a long random `FINN_ADMIN_TOKEN`.
2. **Frontend:** deploy `frontend/` to Vercel, or use `Dockerfile.frontend`. Set `BACKEND_URL` to the backend's address **at build time**, because Next.js fixes the proxy target when it builds.
3. Open the site, go to **Settings**, enter the admin token, and add a model key.

### Check these after deploying

- **Exchanges may block cloud servers.** NSE is known to refuse many data-centre IP addresses. FINN falls back to BSE for filings and says when a source fails, so open the Alerts and Sources pages on the live site and confirm filings and documents arrive.
- **Free hosts sleep.** Background checks stop while the host sleeps, and the first request afterwards is slow.
- **Everyone shares one set of data.** There are no user accounts, so anyone with the link can change portfolios, rules and thresholds. Only AI keys and Telegram details are protected. That's fine for a review prototype, not for real use.

## Settings

Everything is optional.

| Variable | Default | Purpose |
|---|---|---|
| `LLM_PROVIDER` | `gemini` | `gemini`, `groq`, `openai` or `anthropic`. Usually set from Settings |
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | none | Usually set from Settings |
| `LLM_MIN_SECONDS_BETWEEN_CALLS` | `5` | Keeps background reading inside free-tier limits |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | none | Alerts to your phone. Usually set from Alert Settings |
| `FINN_ADMIN_TOKEN` | none | Required to change keys from anywhere but the machine running FINN |
| `FINN_ENV_FILE` | `backend/.env` | Where keys are saved |
| `FINN_DOCS_DIR` | `backend/data/documents` | Where document text is saved |
| `DEMO_MODE` | `true` | Keeps the labelled sample digest available behind the Demo switch |
| `BACKEND_URL` | `http://localhost:8000` | Frontend build setting: where `/api` is proxied |
