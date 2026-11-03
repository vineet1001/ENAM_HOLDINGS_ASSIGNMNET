# Submission note

**To:** assessment@enam.com
**Subject:** ENAM - IIT screening - 2027

- **Mobile prototype:** [add link]
- **GitHub repository:** [add link]
- **AI build history:** [add link or attachment]

## What I built

FINN is a mobile-first investment agent for Indian listed companies. Its Push side tells you what needs attention in your portfolio. Its Pull side researches any listed company from its own annual report and concall transcripts.

**Push.** The briefing shows real NSE and BSE filings for your portfolio over a window you choose, with routine items collapsed. Alerts fire on material filings, unusual volume and price moves. Each investor sets those limits on an Alert Settings page, including per-stock limits, and the page shows how often a value would have fired over the last 30 sessions before it's saved. A results filing shows Revenue, EBITDA, PBT and PAT with QoQ and YoY from the filing. A management change shows a short bio of the person, from the filing.

**Pull.** Eight views for any NSE or BSE company: business, financial snapshot, trajectory, balance sheet with working-capital cycle, cash quality, narrative vs numbers, guidance, and bull vs bear. Narrative vs numbers is the centre of it: it lists what management promised on the last calls, gives each promise a verdict against what was reported, and shows management's exact words with a link to the page.

## The decisions that matter

**Models read; Python calculates and checks.** A model copies numbers and quotes from documents. Code does the arithmetic, then checks the output: a figure missing from the filing is dropped, a quote not found in the transcript is dropped, and any other unmatched number is flagged on screen. A wrong number is the worst thing this product could show, so this got the most attention.

**It's useful with no key.** Prices, filings, alerts, financial views and document search all work without a model. The AI layer adds reading on top, and when it's missing or failing the page says so.

**Cost.** Routine reading goes to a light model, and only the two views that reason across documents use a stronger one. Every answer is saved, so nobody pays to read the same document twice. Retrieval is BM25 in plain Python, with no vector database.

**Interaction.** Cards swipe to save or dismiss, keyboard shortcuts work on desktop, verdict counts filter the promises, and thresholds preview live as they change.

## What it doesn't do yet

- Screener.in supplies the multi-year financial tables, and it compiles filings rather than being one. Results alerts use the filing itself, and the fallback is labelled.
- OCR reads scanned filings of up to 12 pages. A scanned annual report still can't be read.
- Prices are end of day, so price and volume alerts describe the latest close.
- There are no user accounts, so everyone using a link shares one portfolio and one set of thresholds.
- Real-model testing so far covers filing headlines, results tables and bios, from Gemini on 20 real NSE filings. It found two checking bugs, both fixed. [Confirm before sending: run the research views with a real key and add what you found.]

With more time, I'd add per-user accounts, push notifications that work with the app closed, and evaluation sets to measure extraction accuracy over many filings.
