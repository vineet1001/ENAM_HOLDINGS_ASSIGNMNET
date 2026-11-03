# FINN

A mobile-first investment agent for Indian listed companies, built for the ENAM Holdings AI Engineer Build Challenge.

- **Push** tells you what needs attention in your portfolio today.
- **Pull** researches any NSE or BSE company from its own annual report and concall transcripts.

## Run it

```bash
pip install -r backend/requirements.txt
cd frontend && npm install && npm run build && cd ..
python run_finn.py
```

Open http://localhost:3000. Live prices, filings, alerts and financial views work with no setup. To turn on AI reading, add a key under **Settings**. Google Gemini and Groq both offer free tiers.

See [DEPLOYMENT.md](DEPLOYMENT.md) for Docker and hosting, and [ARCHITECTURE.md](ARCHITECTURE.md) for how it works.

## Push

| Feature | What you get |
|---|---|
| Daily briefing | Real filings for your portfolio over 24 hours, 3, 7 or 30 days, with routine items collapsed |
| Alerts | Material filings, unusual volume and price moves, checked automatically |
| Your thresholds | A separate **Alert Settings** page: presets, price and volume limits, per-stock limits, filing types, check frequency and digest defaults |
| Threshold preview | Shows how often a value would have fired over the last 30 sessions, before you save it |
| Results first cut | Revenue, EBITDA, PBT and PAT with QoQ and YoY, from the filing |
| Management changes | A short bio of the person, from the filing, plus a LinkedIn search link |
| Other filings | A one-line AI headline, and a page-linked summary on request |
| Notifications | Browser notifications while FINN is open, and Telegram at any time |
| Scanned filings | Short scanned letters (up to 12 pages) are read by OCR, and labelled as such |

## Pull

Nine views for any listed company:

1. **Business:** what it does, segments and revenue mix
2. **Financial snapshot:** latest quarter, full year and ratios
3. **Trajectory:** up to 10 years and recent quarters, with what's speeding up or slowing down
4. **Balance sheet:** leverage and the working-capital cycle
5. **Cash quality:** how much profit turns into cash
6. **Narrative vs numbers:** what management promised on recent calls against what was delivered, with verdicts and exact quotes
7. **Guidance:** promises by call, with page links
8. **Bull vs bear:** a case each way with evidence and caveats
9. **Price scenarios:** the usual price range ahead and how often such ranges held before, moving averages, RSI, Bollinger bands, the price at the stock's own historical P/E, and the growth the current price assumes (reverse DCF). These are labelled as scenarios, not forecasts, and use no AI.

You can also ask your own question. Answers come only from the company's documents and reported numbers.

On **Sources & Documents**, every annual report, transcript and presentation has a **Summary**: a headline, an overview, key points, figures and risks, each linked to its page, plus a section-by-section view for long reports. The page says how many AI calls it will take before you start, it runs in the background, and it's saved for everyone. **Summarise all** queues every document. Without a key, it shows the document's key sentences instead.

In the portfolio builder, **Suggest weights** uses Markowitz optimisation on past prices. You choose the goal (best return for the risk, or lowest risk), a cap per stock and how many years of history. It shows the efficient frontier, compares the suggestion with your weights and equal weights, and applies the suggestion only if you ask.

## On a phone

The bottom bar has Briefing, Portfolio, Filings and Alerts, and **Menu** opens every page. The menu button at the top left does the same. Switch between the **dark and light themes** with the sun or moon button in the header, or in the menu. The choice is remembered in that browser.

## With and without an AI key

| | No key | With a key |
|---|---|---|
| Prices, filings, alerts, thresholds | Yes | Yes |
| Financials, trajectory, balance sheet, cash quality | Yes | Yes |
| Results table on a filing | Latest quarter from Screener, labelled | Read from the filing |
| Management bio | Link to the filing | Read from the filing |
| Business, guidance, narrative | Page-linked excerpts and matched sentences | Full analysis |
| Bull vs bear | From the numbers only | From numbers and documents |
| Document summary | Key sentences picked from the document | Full summary of every page, checked |

## How it stays accurate

Models read, and Python does the arithmetic. Model output is checked against the source: figures not in the filing and quotes not in the transcript are dropped, and any other unmatched number is flagged on screen. Check important figures against the linked page, and treat nothing here as investment advice.

## Data sources

| Data | Source |
|---|---|
| Prices and volume, end of day | Yahoo Finance |
| Filings and their PDFs | NSE and BSE corporate announcements |
| Multi-year reported financials | Screener.in's tables of company filings |
| Research text | Annual reports and concall transcripts |

Sample data from the original prototype is still available behind clearly labelled Demo switches. Nothing shows it by default.

## Tests

```bash
python -m pytest backend/tests -q
```

The tests use a temporary copy of the database and don't touch the network. See [TEST_REPORT.md](TEST_REPORT.md).

## Project layout

```
backend/app/api/        HTTP endpoints
backend/app/services/   live_data, alert_engine, alert_settings, notifications, filing_ai,
                        screener, fundamentals, documents, document_summary, research_engine,
                        price_scenarios, portfolio_optimizer, ocr, ai_providers
backend/tests/          Tests
frontend/src/app/       Pages, including settings/alerts
frontend/src/components Shared interface pieces
run_finn.py             Starts everything
```
