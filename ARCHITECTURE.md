# FINN architecture

## Overview

```
Phone or desktop browser
        |
Next.js 14 (App Router, TypeScript, Tailwind)   /api is proxied to the backend
        |
FastAPI + SQLAlchemy async + SQLite
        |
  +-----+---------------------+----------------------+------------------+
  |                           |                      |                  |
Yahoo Finance            NSE and BSE            Screener.in        One AI platform
prices, volume           announcements          reported tables,   Gemini, Groq,
                         + original PDFs        report and         OpenAI or Anthropic
                                                transcript links
```

Three background loops run inside the backend process:

- **Live sync** fetches filings and prices, stores them, runs the rules and sends notifications. The interval is set in Alert Settings.
- **Filing reader** reads alerted filings one at a time, newest first, and stays idle with no key.
- **Document reader** downloads and extracts a company's annual report and transcripts one company at a time. PDF extraction runs in its own process so a large report can't stall other requests.

## Rules the code follows

1. **Python does all the arithmetic.** Models copy numbers. Margins, QoQ, YoY, growth rates and thresholds are calculated in code.
2. **Model output is checked, not trusted.**
   - A printed figure in a results table is dropped if it isn't in the filing's text.
   - A guidance quote is dropped if it isn't in the transcript, and its page is taken from where it was actually found.
   - A person in a bio is dropped if the filing doesn't name them.
   - A verdict on a promise that was never extracted is discarded.
   - A source id that wasn't supplied resolves to nothing.
   - Any other number that can't be matched is shown with a visible flag.
3. **Pull research uses only primary documents.** The prompt forbids outside knowledge, and document text is marked as data, not instructions. This is a strong instruction but not a guarantee, which is why rule 2 exists.
4. **It works without a model.** Numeric views need no key. Document views fall back to page-linked excerpts and pattern-matched sentences, and always say so.
5. **Missing data is stated.** No transcripts, a scanned PDF, a failed source and a model error each produce their own message.

## Push

| Step | What happens | Where |
|---|---|---|
| Collect | NSE and BSE filings merged per company, with exchange labels mapped to 17 categories | `services/live_data.py` |
| Decide | Rules for price, volume and filing category, with de-duplication. A stock's own limit replaces the global one | `services/alert_engine.py` |
| Read | Results filing: one model call gives the headline and the table. Management filing: one call gives the headline and bios | `services/filing_ai.py` |
| Deliver | Digest, alert cards, browser notifications, Telegram | `app/page.tsx`, `services/notifications.py` |
| Tune | Thresholds, presets, per-stock limits, categories and digest defaults, with a preview of how often a value would have fired | `app/settings/alerts/page.tsx`, `services/alert_settings.py` |

Before a model has read a results filing, the card shows the latest reported quarter from Screener's table and labels it as such.

## Pull

| View | Comes from | Model? |
|---|---|---|
| Financial snapshot, Trajectory, Balance sheet, Cash quality | Screener tables through `services/fundamentals.py` | No |
| Business | Annual report's narrative pages | Light |
| Guidance | Each transcript, read once and saved | Light |
| Narrative vs numbers | Saved guidance + reported numbers + later commentary | Strong |
| Bull vs bear | Reported numbers + retrieved passages | Strong, or numbers only with no key |
| Free-form question | Retrieved passages + reported numbers | Light |
| Price scenarios | Ten years of prices + reported EPS and cash flow, through `services/price_scenarios.py` | No |

**Price scenarios** contains:
- **Volatility range:** a lognormal band with no assumed trend, plus a check of how often the same kind of band held in the stock's own past.
- **Trend signals:** 50- and 200-day averages, RSI and Bollinger bands.
- **P/E band:** the stock's own year-end P/E history applied to the last 12 months' EPS.
- **Reverse DCF:** the growth the current price needs, for a choice of required return and long-run growth.

None of it is presented as a forecast.

**Weight suggestions** (`services/portfolio_optimizer.py`) use Markowitz mean-variance optimisation:
- Long only, with a cap per stock.
- Covariance is lightly shrunk, so a few noisy years count for less.
- The goal is either the best Sharpe ratio or the lowest risk, solved with plain numpy.
- They're offered inside the portfolio builder and only applied if the user chooses.

**Document summaries** (`services/document_summary.py`) cover every page of an annual report, transcript or presentation on the Sources page:
- The document is split into runs of whole pages of about 100,000 characters (18,000 on Groq, whose free tier allows far fewer tokens a minute). A transcript is usually one call. A 500-page annual report is about 15 part calls with the light model, then one call with the stronger model that writes the summary from those notes.
- The page states the number of calls before anything starts. The work runs in the background, and each part is saved as it finishes, so a quota pause or a restart carries on rather than starting again.
- The check is the same as for filings. A figure whose value isn't in the document is removed, a point with an unmatched number is flagged, and page references outside the document are cleared.
- Without a key, the page shows the document's most representative sentences instead. They're scored TF-IDF style across pages, with name lists, table rows and boilerplate skipped, and taken from the front 40% of an annual report.

**Interface:** a dark and a light theme, chosen from the header, the sidebar or the phone menu and kept in the browser. The light theme remaps the fixed dark colours in `globals.css`, keeping text at WCAG AA contrast and chart colours validated for a white surface. On a phone, the bottom bar has four pages and a Menu that lists every page.

## Keeping costs down

- **Routing:** routine reading uses a light model, and only the two reasoning views use the stronger one. Both can be changed per platform in Settings.
- **Caching:** filing insights are saved per document. Research answers are saved against the documents and latest quarter they used, so they're only redone when something new arrives. Screener pages are cached for 12 hours.
- **Less text per call:** filings send the pages most relevant to their category. Research sends retrieved passages, not whole reports.
- **No vector database:** retrieval is BM25 in plain Python. A search across a company's documents takes about 0.1 seconds and needs no embeddings service.
- **Pacing:** background reading is spaced out and pauses when the platform reports a rate limit.

## Known limits

- **Screener.in is a secondary source for the tables.** It compiles company filings. It's used for multi-year history. Results alerts read the filing itself when a model is available.
- **Scanned PDFs up to 12 pages are read by OCR.** Longer scans, such as a scanned annual report, are still reported as unreadable. OCR text can misread a digit, and the number check can't catch that, so OCR-read filings are labelled.
- **Prices are end of day**, so a price or volume alert describes the latest close, not the live market.
- **Retrieval is keyword based.** Common finance synonyms are added, for example debt and borrowings, but a passage worded very differently from the question can still be missed.
- **Results figures are checked twice.** Each figure must appear in the filing, and a row is flagged when its figures aren't printed on one line together. A real number attached to the wrong line can still slip through if it happens to share a line.
- **Quotes may be lightly tidied by the model.** A near-identical sentence is accepted, and the page shows the transcript's own words, not the model's.
- **Price scenarios aren't forecasts.** The volatility range assumes no trend. The P/E band can be distorted when reported EPS isn't adjusted for a split, and such years are dropped. The reverse DCF can't subtract cash.
- **Weight suggestions rely on past returns**, which are a weak guide to future ones.
- **Summaries of very long reports** cover the first 500 pages, which is all that's read, and the page says so. A summary built from part notes can miss a detail that only matters across parts.
- **Companies with no transcripts:** investor presentations are read instead, and these say less.
- **Bios use only what the filing says.** LinkedIn is a search link, not scraped.
- **No user accounts.** One shared portfolio set and one set of thresholds.
