# FINN: AI build history

How I built FINN with Claude Code: my prompts, word for word, in the order I sent them. Spelling is left as typed.

- **Tool:** Claude Code (VS Code extension), one session.
- **Full record:** the exported session, with Claude's replies, every tool call and every test run. This file is the index to it.
- **Earlier work:** the first version, before this session, was built with [add the tool] ([add export or share link]).

## How I worked with the tool

- **I set direction and scope**, then asked questions to check what was really happening ("Are we using any model here?", "Are these headlines extracted from the filings?").
- **I pasted the brief and my own notes** when the work drifted from what ENAM asked for.
- **I asked for options before big changes** (price prediction methods, OCR size, 500-page reports), then chose.
- **I tested on my phone** and reported what broke.

## 1. Audit and first improvements

**Prompt 1** · *Pointed Claude Code at the brief, the reference PDF and the README of the work so far.*

```text
@README.md  this file contain what we have done until now for the task @"1. ENAM_AI_Engineer_Build_Challenge_Main.pdf"  @"2. ENAM_AI_Engineer_Build_Challenge_Reference.pdf"  provided in these files. Ana;yse them and open run them. Also, can you make the UI more interactive
```

## 2. Understanding what exists

**Prompt 2**

```text
Is itaccessing all the relevant documents like Income statemenst or other documents in the alters so that can i person see it or not ? How are we giving them
```

**Prompt 3**

```text
give me commands to run the app or tell me how can i run it
```

**Prompt 4** · *Pasted the terminal output when the app failed to start.*

Pasted text:

> =================================================================
> 🚀 FINN is running and accessible!
> • Web Interface:       http://localhost:3000
> • API Swagger Docs:    http://localhost:8000/docs
> • API Health Endpoint: http://localhost:8000/api/health
> =================================================================
> Press Ctrl+C to stop both servers.
>
>
> > finn-frontend@1.0.0 start
> > next start -p 3000
>
>  ⨯ Failed to start server
> Error: listen EADDRINUSE: address already in use :::3000
>     at Server.setupListenHandle [as _listen2] (node:net:2324:16)
>     at listenInCluster (node:net:2433:12)
>     at Server.listen (node:net:2558:7)
>     at D:\Enam Holdings\frontend\node_modules\next\dist\server\lib\start-server.js:280:16
>     at new Promise (<anonymous>)
>     at startServer (D:\Enam Holdings\frontend\node_modules\next\dist\server\lib\start-server.js:191:11)
>     at Module.nextStart (D:\Enam Holdings\frontend\node_modules\next\dist\cli\next-start.js:25:40)
>     at D:\Enam Holdings\frontend\node_modules\next\dist\bin\next:105:856 {
>   code: 'EADDRINUSE',
>   errno: -4091,
>   syscall: 'listen',
>   address: '::',
>   port: 3000
> }

**Prompt 5**

```text
lets go page by page, what does the daily brienfing page shows
```

## 3. Live data and the portfolio

**Prompt 6**

```text
See,  we want this app to be live, so we want to use a free APIs. So in the daily briefing, palce a grpah which will show the overall portfolio progress how it is chaning which also has an option with dropdown containing the names of the Companies in the portfolio. Use live data for this using any free API which can provide us. ALso for the demo links, try to give more live links where people can see this. Use Free API of platform which can provide us that.
```

**Prompt 7**

```text
The headlines coming in the altert are these extratcted from the fillings or not ? From the search option we can search for any compnay listed in NSE, right ?
Now, in the portfolio section, give them an option so that they can create a portfolio by providing weights chosen by the person and they should be able to add any company listed in NSE as well as BSE and this portfolio should be reflected in the daily breifing graph. 
whqat does the start mark in the company stock are saying ?
```

## 4. The AI layer

**Prompt 8**

```text
Are we using any model here ?
```

**Prompt 9**

```text
All the alerts I am seeing a demo, try to have a model, which will extract the pdfs of the documents provided there and by ananlysising it, it will explain the things as headline and If someone wants a summary and add an option for it which one model will do it. Try to use a lightweight good model
```

**Prompt 10**

```text
Make a part in the settings where people can insert the API for the paltforms
```

## 5. Aligning with the brief and completing Push and Pull

**Prompt 11** · *Pasted the brief's sections on data sources, Push and Pull to check progress against it.*

Pasted text:

> The backend — your data sources (guided)
> Three sources. Get them working; don't over-engineer them — this part is plumbing, not the point.
> ● Price & volume (end-of-day) for your portfolio. Freely scrapable at end of day from public
> sources — Yahoo Finance is the usual starting point (the yfinance Python library; Indian
> tickers use .NS for NSE and .BO for BSE, e.g. RELIANCE.NS). Anything equivalent works.
> ● Corporate announcements / filings from NSE/BSE for those stocks. A classification of
> announcement types is provided in the companion reference document — use it, adapt it, or
> ignore it. It's there to orient you, not to constrain you.
> ● Company fundamentals — annual reports and concall (earnings-call) transcripts, both
> available as links on screener.in (or the company's investor-relations site).
> The frontend — your canvas
> This is the heart of the challenge. Give us part of a real investor's daily workflow, built beautifully.
> The items below are examples of the kinds of things that help — illustrations, not a checklist. What
> you choose to build, and how, is the signal.
> Push — the app reaches out to you
> Push is the app telling you what changed without being asked. Think of it in two
>
> [... rest of the pasted text is in the full export]

Then wrote:

```text
how much we have done this
```

**Prompt 12**

```text
We have a lot of time, the deadline is extended. Complete the whole PULL and PUSH side. TRy to give options to the user to fix their threshould. Create a seperate setting page so that they can add this and complete the whole project
```

## 6. Review, limitations and new methods

**Prompt 13**

```text
how much the project has been compleeted ?
```

**Prompt 14** · *Pasted a limitations list, then asked follow-up questions.*

Pasted text:

> 4. Current System Limitations
> Market Hours & Free Data Latency:
> Uses public/free endpoints (yfinance, public exchange feeds). EOD price data reflects the latest market close, not tick-by-tick sub-second streaming.
> LLM Token Limits on 400-page Reports:
> Full Annual Reports can be 300–500 pages. FINN uses keyword-filtered page extraction (retrieving the narrative and MD&A sections) rather than passing the entire 500-page raw text into the LLM context window.
> Standalone vs Consolidated Nuance:
> While FINN defaults to consolidated numbers where available, some newly listed or pure holding companies only report standalone numbers. Screener data reflects what is filed, but comparison between mixed bases requires vigilance.
> Executive LinkedIn Scraping:
> Scraping live LinkedIn profiles programmatically violates LinkedIn ToS and triggers CAPTCHAs. FINN enriches executive backgrounds using structured filing text and LLM retrieval based on public filings rather than an unauthorized direct LinkedIn scraper.

Then wrote:

```text
are only these limitations of our project or are there more ? If yes tell me and also tell me where we are using LLM. And I want to add something like strategies in Pull Section, where it will consists of some price prediction methods which will let the user see, whatis the expected price using some methods like using Portfolio maximization theorem or using some other statistical approaches. Only some common ones like via graph ananlysis. first telll me if it is possible or not and also for teh OCR, will it take too much of the space or not and if yes then how much and also for the 500 pages extraction, how much will it take.
```

**Prompt 15** · *Quoted Claude's recommendations back and approved them.*

```text
My recommendation:

Research: add a 9th tab, "Price scenarios", with the volatility range, moving averages, P/E band and reverse DCF.
Portfolio page: put Markowitz there, since it sets weights rather than predicting a price. It can suggest weights in the portfolio builder you already have.
Size: this adds nothing heavy. numpy and pandas are already installed, and the optimiser can be written with numpy alone.My recommendation: use OCR only for short scanned filings, up to about 20 pages, which are the common case in Push alerts. For the rare scanned annual report, keep "can't be read".

Please do these and if possible try to solve the limitations
```

## 7. Running it on a phone

**Prompt 16**

```text
how to run this on phone
```

**Prompt 17** · *Sent with a screenshot of the Cloudflare tunnel running.*

```text
this
```

**Prompt 18**

```text
The link is not working
```

**Prompt 19** · *Re-ran the tunnel command.*

```text
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:3000
```

## 8. Polish from phone testing

**Prompt 20**

```text
There is no menu baar in the side baar panel for teh daily breifing and other things.  Add summary part in sources and documents for all the documents provided in teh sources and documents secrtion. This should be like for each one we can get the summary of teh whole doicument. Also add dark and white theme so that user can check.  Please do all these changes
```

## Study prompts

Prompts for understanding the most complex parts in depth, in the order the app was built. Each is meant to be run in Claude Code inside the project, with the answer read against the code.

### 1. Data plumbing

1. "Walk me through how FINN gets end-of-day prices from yfinance and filings from NSE and BSE. Where does it fall back to BSE, and how does it avoid false alerts after a stock split? Point me to the functions in `live_data.py` and `live_sync.py`."
2. "Why are Screener.in tables used for multi-year financials instead of raw filings? What would it take to build them from exchange XBRL instead, and what could go wrong?"

### 2. Push: alerts and thresholds

1. "Explain how an unusual-volume alert is decided in `alert_engine.py`. What baseline does it compare against, and how does the threshold preview count how often a value would have fired over 30 sessions?"
2. "How are filings classified into categories like results, M&A and pledging? Show me where routine items get collapsed in the briefing."

### 3. The AI layer and its checks

1. "Trace one results filing from PDF download to the Revenue, EBITDA, PBT and PAT table on screen. Where does the model stop and Python take over, and which checks can drop or flag a figure?"
2. "Explain the split-decimal bug found with real Gemini output on NTPC and SBI. Why was the fix to teach the checker the pattern, rather than relax the check?"
3. "How does quote checking work with a 0.9 similarity ratio? What would a too-low or too-high threshold let through or block?"

### 4. Retrieval and research views

1. "Explain BM25 as implemented in `documents.py`, including the synonym weighting. When would a vector search beat it on annual reports, and how would I measure that?"
2. "How does narrative vs numbers decide a verdict of delivered, partly, missed or too early? What does the stronger model see, and what is checked afterwards?"

### 5. Price scenarios and Markowitz

1. "Derive the lognormal volatility range used in `price_scenarios.py` from first principles. Why is there no drift, and what does the backtest hit rate tell a user?"
2. "Explain the reverse DCF: what is solved by bisection, why the base is a 3-year average of free cash flow, and why it's not applicable to banks."
3. "Explain the Markowitz optimiser in `portfolio_optimizer.py`: covariance shrinkage, the capped simplex projection, and how the frontier and maximum Sharpe point are found. Why can unconstrained Markowitz give extreme weights?"

### 6. Cost, scale and long documents

1. "Estimate the model cost of FINN for 100 users with 15 stocks each for one month on Gemini's paid tier, given that answers are saved per document. Where is the money spent?"
2. "Explain how a 500-page annual report is summarised in parts, how a quota error mid-way is resumed, and what a part-by-part summary can miss."
3. "What does OCR add in disk space and time per page, and why is it limited to 12 pages?"

### 7. Deployment and security

1. "Why can't the backend run on serverless? Walk me through deploying it to Render with a persistent disk, and what to check about NSE blocking cloud IPs."
2. "How are API keys protected when the app is shared by link? Show me `require_owner` and `_is_local_request`, and tell me how someone could still misuse a shared link."
