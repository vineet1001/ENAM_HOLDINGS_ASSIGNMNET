# FINN test report

Run on 3 November 2026, on Windows with Python 3.13 and Chrome.

## Results

| Suite | Checks | Passed | What it covers |
|---|---:|---:|---|
| Backend (`python -m pytest backend/tests`) | 252 | 252 | Calculations, classification, API, live data parsing, filing reader, results and bio checks, alert preferences, notifications, research engine, sparse companies, price scenarios, optimiser, OCR, quote matching, synonyms, split restatement, document summaries. No network |
| Browser: menu, themes and summaries, no key | 27 | 27 | Phone menu, light and dark themes with contrast checks, no-key summaries, desktop sidebar |
| Browser: document summaries, stand-in model | 21 | 21 | One call for a transcript, 16 for a 590-page report, invented figures removed, saved summaries cost nothing |
| Browser: research, sources, alert settings, no key | 62 | 62 | All 9 views on a phone, fallbacks, thresholds, preview, presets, per-stock limits, saving |
| Browser: research, sources, alert settings, stand-in model | 65 | 65 | Verdicts, flagged numbers, dropped quotes, saved answers cost no second call |
| Browser: price scenarios and weight suggestions | 18 | 18 | Three real companies including a lender and a thin-earnings stock, chart touch, controls, applying suggested weights |
| Browser: whole app | 95 | 95 | Briefing, inbox, alerts, portfolio builder, keyboard use, outage behaviour |
| Browser: AI keys | 23 | 23 | Saving, testing and removing keys, and that keys never come back to the page |
| Browser: filing reader, no key | 10 | 10 | Real alerts and setup instructions |
| Browser: filing reader, stand-in model | 21 | 21 | Headlines and summaries through the whole flow |

Browser suites ran against live Yahoo, NSE, BSE and Screener data, on a throwaway copy of the database.

## Real-model check

FINN read 20 real NSE filings with Gemini (`gemini-3.5-flash-lite`):

- **Headlines:** 17 were short, specific and matched their filings.
- **Results tables:** read from the filings for ITC, Reliance, L&T and Sun Pharma.
- **Bios:** taken from the HDFC Bank and Axis Bank filings.

It also exposed three problems, now fixed and covered by tests:

- **Correct headlines were withheld.** Two of three withheld headlines (NTPC and SBI) were right. Their PDFs draw the decimal point apart from the digits, so `54269.95` was extracted as `54269 95` and failed the number check. Split decimals now count, and a withheld results headline is replaced by one built from the checked table.
- **An empty headline looked stuck.** It left a card showing "AI is reading" forever. It now ends with a note.
- **One withheld headline was correctly withheld.** Maruti's `533,441` doesn't appear in the filing.

**Still not checked with a real model:** document summaries, the research views (business, guidance, narrative vs numbers, bull vs bear, questions), and the Groq, OpenAI and Anthropic response formats. Browser runs of those used a local stand-in that proves the wiring and checks, not answer quality.

## What these tests don't prove

**OCR** was tested on a scanned copy of a real document, at about 3 to 9 seconds a page depending on text density. There are no real scanned exchange filings on record yet.

**Telegram delivery** has been tested against a mocked Telegram server, not a real bot.

**Browser notifications** are implemented, but the suites don't exercise the permission prompt or an actual notification.

**Docker and hosted deployment** haven't been run. Whether NSE and BSE accept requests from a cloud server can only be checked after deploying.
