"""Turns standardised financials into the numeric research views. All arithmetic, no model."""
from typing import Optional

from app.services.financial_calc import margin, pct_change, safe_round

SOURCE_NOTE = "Screener.in tables of company filings"


def _row(table: dict, *names: str) -> list[Optional[float]]:
    """A row by any of its possible labels. Banks and companies label the same line differently."""
    rows = table.get("rows", {})
    for name in names:
        for label, values in rows.items():
            if label.lower() == name.lower():
                return values
    return []


def _value(values: list, index: int) -> Optional[float]:
    return values[index] if -len(values) <= index < len(values) else None


def _ratio(numerator: Optional[float], denominator: Optional[float], digits: int = 2) -> Optional[float]:
    if numerator is None or not denominator:
        return None
    return round(numerator / denominator, digits)


def _sum(*parts: Optional[float]) -> Optional[float]:
    present = [p for p in parts if p is not None]
    return sum(present) if present else None


def is_financial_company(data: dict) -> bool:
    """Banks and lenders report financing profit, and have no EBITDA or meaningful operating cash flow."""
    return bool(_row(data["tables"]["annual"], "Financing Profit") or _row(data["tables"]["quarters"], "Financing Profit"))


def _core_rows(table: dict) -> dict[str, list]:
    return {
        "revenue": _row(table, "Sales", "Revenue"),
        "ebitda": _row(table, "Operating Profit", "Financing Profit"),
        "margin": _row(table, "OPM %", "Financing Margin %"),
        "other_income": _row(table, "Other Income"),
        "interest": _row(table, "Interest"),
        "depreciation": _row(table, "Depreciation"),
        "pbt": _row(table, "Profit before tax"),
        "pat": _row(table, "Net Profit"),
        "eps": _row(table, "EPS in Rs"),
    }


def quarterly_comparison(data: dict, ticker: str, name: str) -> Optional[dict]:
    """This quarter against last quarter (QoQ) and the same quarter a year ago (YoY)."""
    table = data["tables"]["quarters"]
    periods = table["periods"]
    core = _core_rows(table)
    if len(periods) < 2 or not core["revenue"]:
        return None

    has_year_ago = len(periods) >= 5
    financial = is_financial_company(data)

    def comparison(label: str, values: list) -> dict:
        current, previous = _value(values, -1), _value(values, -2)
        year_ago = _value(values, -5) if has_year_ago else None
        qoq, yoy = pct_change(current, previous), pct_change(current, year_ago)
        return {
            "metric": label,
            "current_quarter": current,
            "previous_quarter": previous,
            "year_ago_quarter": year_ago,
            "qoq_change": round(current - previous, 2) if current is not None and previous is not None else None,
            "qoq_pct": round(qoq, 2) if qoq is not None else None,
            "yoy_change": round(current - year_ago, 2) if current is not None and year_ago is not None else None,
            "yoy_pct": round(yoy, 2) if yoy is not None else None,
            "unit": "₹ Crores",
        }

    def period_margin(index: int) -> Optional[float]:
        return safe_round(margin(_value(core["ebitda"], index), _value(core["revenue"], index)))

    raw_pdfs = table.get("raw_pdfs") or []
    return {
        "company_ticker": ticker,
        "company_name": name,
        "current_period": periods[-1],
        "previous_period": periods[-2],
        "year_ago_period": periods[-5] if has_year_ago else None,
        "reporting_basis": data.get("basis", "consolidated"),
        "metrics": [
            comparison("REVENUE", core["revenue"]),
            comparison("Financing Profit" if financial else "EBITDA", core["ebitda"]),
            comparison("PBT", core["pbt"]),
            comparison("PAT", core["pat"]),
        ],
        "ebitda_margin_current": period_margin(-1),
        "ebitda_margin_previous": period_margin(-2),
        "ebitda_margin_yago": period_margin(-5) if has_year_ago else None,
        "source": SOURCE_NOTE,
        "source_url": raw_pdfs[-1] if raw_pdfs else data.get("url"),
        "is_demo": False,
        "extraction_confidence": 1.0,
        "ebitda_note": (
            "Banks and lenders report financing profit in place of EBITDA."
            if financial else "EBITDA here is operating profit before other income."
        ),
    }


def _annual_years(table: dict) -> list[tuple[int, str]]:
    """Index and label of each full year, leaving out the trailing-twelve-month column."""
    return [(i, label) for i, label in enumerate(table["periods"]) if label.upper() != "TTM"]


def _cagr(values: list[Optional[float]], years: int) -> Optional[float]:
    """Growth rate over the last N years. Not meaningful unless both ends are positive."""
    if len(values) <= years:
        return None
    start, end = values[-years - 1], values[-1]
    if start is None or end is None or start <= 0 or end <= 0:
        return None
    return round(((end / start) ** (1 / years) - 1) * 100, 1)


def financial_snapshot(data: dict) -> dict:
    annual = data["tables"]["annual"]
    balance = data["tables"]["balance"]
    comparison = quarterly_comparison(data, "", "")
    ratios = data.get("top_ratios", {})
    core = _core_rows(annual)
    years = _annual_years(annual)
    last_year = years[-1][0] if years else -1

    revenue, ebitda, pat = (_value(core[k], last_year) for k in ("revenue", "ebitda", "pat"))
    debt = _value(_row(balance, "Borrowings", "Borrowing"), -1)
    net_worth = _sum(_value(_row(balance, "Equity Capital"), -1), _value(_row(balance, "Reserves"), -1))

    observations = []
    if comparison:
        for row in comparison["metrics"]:
            label = "Revenue" if row["metric"] == "REVENUE" else row["metric"]
            if row["current_quarter"] is not None:
                observations.append({
                    "label": label, "value": row["current_quarter"],
                    "qoq_pct": row["qoq_pct"], "yoy_pct": row["yoy_pct"],
                })

    return {
        "period": comparison["current_period"] if comparison else None,
        "reporting_basis": data.get("basis", "consolidated"),
        "latest_quarter": observations,
        "ebitda_margin": comparison["ebitda_margin_current"] if comparison else None,
        "ebitda_note": comparison["ebitda_note"] if comparison else None,
        "full_year": {
            "label": years[-1][1] if years else None,
            "revenue": revenue,
            "ebitda": ebitda,
            "pat": pat,
            "ebitda_margin": safe_round(margin(ebitda, revenue)),
            "pat_margin": safe_round(margin(pat, revenue)),
        },
        "ratios": {
            "Market cap (₹ Cr)": ratios.get("Market Cap"),
            "Current price (₹)": ratios.get("Current Price"),
            "P/E": ratios.get("Stock P/E"),
            "ROCE %": ratios.get("ROCE"),
            "ROE %": ratios.get("ROE"),
            "Dividend yield %": ratios.get("Dividend Yield"),
            "Debt / equity": _ratio(debt, net_worth),
        },
    }


def trajectory(data: dict) -> dict:
    annual = data["tables"]["annual"]
    quarters = data["tables"]["quarters"]
    core = _core_rows(annual)
    years = _annual_years(annual)
    roce = _row(data["tables"]["ratios"], "ROCE %", "ROE %")
    ratio_periods = data["tables"]["ratios"]["periods"]

    def by_year(values: list) -> list:
        return [_value(values, i) for i, _ in years]

    series = {key: by_year(core[key]) for key in ("revenue", "ebitda", "pbt", "pat")}
    series["margin"] = [safe_round(margin(e, r)) for e, r in zip(series["ebitda"], series["revenue"])]

    annual_rows = [
        {"period": label, **{key: series[key][pos] for key in series}}
        for pos, (_, label) in enumerate(years)
    ]
    q_core = _core_rows(quarters)
    quarterly_rows = []
    for i, label in enumerate(quarters["periods"]):
        revenue, ebitda = _value(q_core["revenue"], i), _value(q_core["ebitda"], i)
        quarterly_rows.append({
            "period": label, "revenue": revenue, "ebitda": ebitda,
            "pbt": _value(q_core["pbt"], i), "pat": _value(q_core["pat"], i),
            "margin": safe_round(margin(ebitda, revenue)),
        })

    financial = is_financial_company(data)
    growth = [
        {
            "metric": name,
            "cagr_3y": _cagr(series[key], 3),
            "cagr_5y": _cagr(series[key], 5),
            "cagr_10y": _cagr(series[key], 10),
        }
        for name, key in (("Revenue", "revenue"), ("EBITDA", "ebitda"), ("PBT", "pbt"), ("PAT", "pat"))
        if not (financial and key == "ebitda")
    ]

    # What's growing and what's compressing, judged over the last three years.
    signals = []
    for row in growth:
        three, five = row["cagr_3y"], row["cagr_5y"]
        if three is None:
            continue
        if three < 0:
            signals.append({"direction": "compressing", "text": f"{row['metric']} is shrinking: {three}% a year over 3 years"})
        elif five is not None and three < five - 2:
            signals.append({"direction": "slowing", "text": f"{row['metric']} growth slowed to {three}% a year over 3 years, from {five}% over 5"})
        elif five is not None and three > five + 2:
            signals.append({"direction": "accelerating", "text": f"{row['metric']} growth picked up to {three}% a year over 3 years, from {five}% over 5"})
        else:
            signals.append({"direction": "steady", "text": f"{row['metric']} is growing {three}% a year over 3 years"})

    margins = [m for m in series["margin"] if m is not None]
    if len(margins) >= 4 and not financial:
        change = round(margins[-1] - margins[-4], 1)
        if abs(change) >= 0.5:
            signals.append({
                "direction": "compressing" if change < 0 else "expanding",
                "text": f"Margin moved {change:+} points over 3 years, from {margins[-4]}% to {margins[-1]}%",
            })
    return_label = "ROCE" if _row(data["tables"]["ratios"], "ROCE %") else "ROE"
    returns = [r for r in roce if r is not None]
    if len(returns) >= 4 and abs(returns[-1] - returns[-4]) >= 1:
        change = round(returns[-1] - returns[-4], 1)
        signals.append({
            "direction": "compressing" if change < 0 else "expanding",
            "text": f"{return_label} moved {change:+} points over 3 years, from {returns[-4]}% to {returns[-1]}%",
        })

    return {
        "trajectory": annual_rows,
        "quarterly": quarterly_rows,
        "growth": growth,
        "signals": signals,
        "returns": {"label": return_label, "periods": ratio_periods, "values": roce},
        "is_financial": financial,
    }


def _newest_first(periods: list[str], rows: list[dict]) -> tuple[list[str], list[dict]]:
    return (
        list(reversed(periods)),
        [{**row, "values": list(reversed(row["values"]))} for row in rows],
    )


def balance_sheet(data: dict) -> dict:
    balance = data["tables"]["balance"]
    annual = data["tables"]["annual"]
    ratios = data["tables"]["ratios"]
    periods = balance["periods"]
    financial = is_financial_company(data)

    equity = _row(balance, "Equity Capital")
    reserves = _row(balance, "Reserves")
    borrowings = _row(balance, "Borrowings", "Borrowing")
    deposits = _row(balance, "Deposits")
    net_worth = [_sum(_value(equity, i), _value(reserves, i)) for i in range(len(periods))]

    rows = [
        {"metric": "Net worth (equity + reserves)", "values": net_worth},
        {"metric": "Borrowings", "values": [_value(borrowings, i) for i in range(len(periods))]},
    ]
    if deposits:
        rows.append({"metric": "Deposits", "values": [_value(deposits, i) for i in range(len(periods))]})
    for label, names in (
        ("Other liabilities", ("Other Liabilities",)),
        ("Total assets", ("Total Assets",)),
        ("Fixed assets", ("Fixed Assets",)),
        ("Capital work in progress", ("CWIP",)),
        ("Investments", ("Investments",)),
        ("Other assets", ("Other Assets",)),
    ):
        values = _row(balance, *names)
        rows.append({"metric": label, "values": [_value(values, i) for i in range(len(periods))]})

    # Ratios line up by year label, because the balance sheet can have a half-year column the P&L doesn't.
    core = _core_rows(annual)
    annual_index = {label: i for i, label in enumerate(annual["periods"])}
    debt_equity, debt_ebitda, interest_cover = [], [], []
    for i, label in enumerate(periods):
        debt = _value(borrowings, i)
        debt_equity.append(_ratio(debt, net_worth[i]))
        year = annual_index.get(label)
        ebitda = _value(core["ebitda"], year) if year is not None else None
        interest = _value(core["interest"], year) if year is not None else None
        debt_ebitda.append(_ratio(debt, ebitda) if not financial else None)
        interest_cover.append(_ratio(ebitda, interest) if not financial else None)

    ratio_rows = [{"metric": "Debt / equity", "unit": "x", "values": debt_equity}]
    if not financial:
        ratio_rows.append({"metric": "Debt / EBITDA", "unit": "x", "values": debt_ebitda})
        ratio_rows.append({"metric": "Interest cover (EBITDA / interest)", "unit": "x", "values": interest_cover})

    years, table = _newest_first(periods, rows)
    _, ratio_table = _newest_first(periods, ratio_rows)

    working_rows = [
        {"metric": label, "unit": "days", "values": list(_row(ratios, label))}
        for label in ("Debtor Days", "Inventory Days", "Days Payable", "Cash Conversion Cycle", "Working Capital Days")
        if _row(ratios, label)
    ]
    working_years, working_table = _newest_first(ratios["periods"], working_rows)

    observations = []
    latest = len(periods) - 1
    if latest >= 0:
        debt = _value(borrowings, latest)
        if debt is not None and net_worth[latest]:
            observations.append(f"Debt is {_ratio(debt, net_worth[latest])}x net worth in {periods[latest]}.")
        if len(periods) >= 4 and _value(borrowings, latest - 3) is not None and debt is not None:
            before = _value(borrowings, latest - 3)
            change = pct_change(debt, before)
            if change is not None and abs(change) >= 10:
                observations.append(
                    f"Borrowings went from ₹{before:,.0f} Cr to ₹{debt:,.0f} Cr since {periods[latest - 3]}, {change:+.0f}%."
                )
    cycle = _row(ratios, "Cash Conversion Cycle")
    if len(cycle) >= 4 and cycle[-1] is not None and cycle[-4] is not None and abs(cycle[-1] - cycle[-4]) >= 5:
        verb = "lengthened" if cycle[-1] > cycle[-4] else "shortened"
        observations.append(f"The cash conversion cycle {verb} from {cycle[-4]:.0f} to {cycle[-1]:.0f} days over 3 years.")
    if financial:
        observations.insert(0, "For a lender, deposits and borrowings fund the loan book, so debt ratios aren't a risk signal the way they are for other companies.")

    return {
        "years": years,
        "table": table,
        "ratio_table": ratio_table,
        "working_capital_years": working_years,
        "working_capital_table": working_table,
        "unit": "₹ Crores",
        "observations": observations,
        "is_financial": financial,
    }


def cash_quality(data: dict) -> dict:
    cash = data["tables"]["cash"]
    annual = data["tables"]["annual"]
    periods = cash["periods"]
    core = _core_rows(annual)
    annual_index = {label: i for i, label in enumerate(annual["periods"])}
    financial = is_financial_company(data)

    cfo = _row(cash, "Cash from Operating Activity")
    fcf = _row(cash, "Free Cash Flow")
    cfi = _row(cash, "Cash from Investing Activity")
    cff = _row(cash, "Cash from Financing Activity")
    net = _row(cash, "Net Cash Flow")

    def align(values: list) -> list:
        return [_value(values, annual_index[label]) if label in annual_index else None for label in periods]

    pat = align(core["pat"])
    ebitda = align(core["ebitda"])
    cfo_row = [_value(cfo, i) for i in range(len(periods))]
    fcf_row = [_value(fcf, i) for i in range(len(periods))]

    rows = [
        {"metric": "Cash from operations (CFO)", "values": cfo_row},
        {"metric": "Free Cash Flow", "values": fcf_row},
        {"metric": "Net profit (PAT)", "values": pat},
        {"metric": "Cash from investing", "values": [_value(cfi, i) for i in range(len(periods))]},
        {"metric": "Cash from financing", "values": [_value(cff, i) for i in range(len(periods))]},
        {"metric": "Net cash flow", "values": [_value(net, i) for i in range(len(periods))]},
    ]
    ratio_rows = [
        {"metric": "CFO / PAT", "unit": "%", "values": [_ratio(c, p, 3) and round(_ratio(c, p, 3) * 100) for c, p in zip(cfo_row, pat)]},
        {"metric": "FCF / PAT", "unit": "%", "values": [_ratio(f, p, 3) and round(_ratio(f, p, 3) * 100) for f, p in zip(fcf_row, pat)]},
    ]
    if not financial:
        ratio_rows.insert(1, {"metric": "CFO / EBITDA", "unit": "%", "values": [_ratio(c, e, 3) and round(_ratio(c, e, 3) * 100) for c, e in zip(cfo_row, ebitda)]})

    years, table = _newest_first(periods, rows)
    _, ratio_table = _newest_first(periods, ratio_rows)

    # Five years together, because one year's cash can be lumpy.
    window = [(c, p) for c, p in zip(cfo_row, pat) if c is not None and p is not None][-5:]
    total_cfo = sum(c for c, _ in window)
    total_pat = sum(p for _, p in window)
    conversion = round(total_cfo / total_pat * 100) if total_pat > 0 and window else None
    if financial:
        verdict = {
            "level": "not_applicable",
            "text": "For a lender, operating cash flow mostly reflects the loan book growing, so it says little about earnings quality.",
        }
    elif conversion is None:
        verdict = {"level": "unknown", "text": "Not enough years to judge cash conversion."}
    elif conversion >= 90:
        verdict = {"level": "strong", "text": f"Profits turn into cash: operating cash was {conversion}% of net profit over the last {len(window)} years."}
    elif conversion >= 70:
        verdict = {"level": "watch", "text": f"Cash lags profit a little: operating cash was {conversion}% of net profit over the last {len(window)} years."}
    else:
        verdict = {"level": "weak", "text": f"Red flag: operating cash was only {conversion}% of net profit over the last {len(window)} years."}

    observations = [verdict["text"]]
    negative_fcf = sum(1 for f in fcf_row[-5:] if f is not None and f < 0)
    if negative_fcf and not financial:
        observations.append(f"Free cash flow was negative in {negative_fcf} of the last {len(fcf_row[-5:])} years.")

    return {
        "years": years,
        "table": table,
        "ratio_table": ratio_table,
        "unit": "₹ Crores",
        "verdict": verdict,
        "cumulative": {"years": len(window), "cfo": round(total_cfo), "pat": round(total_pat), "conversion_pct": conversion},
        "observations": observations,
        "is_financial": financial,
    }


def numbers_only_bull_bear(data: dict) -> dict:
    """A case each way from the numbers alone, used when no model is available to read the documents."""
    bull, bear = [], []
    trend = trajectory(data)
    cash = cash_quality(data)
    balance = balance_sheet(data)

    for row in trend["growth"]:
        if row["metric"] not in ("Revenue", "PAT") or row["cagr_3y"] is None:
            continue
        verb = "grew" if row["cagr_3y"] >= 0 else "shrank"
        point = {
            "claim": f"{row['metric']} {verb} {abs(row['cagr_3y'])}% a year over 3 years",
            "evidence": f"10-year rate {row['cagr_10y']}%, 5-year rate {row['cagr_5y']}%",
            "caveat": "Past growth from reported numbers",
        }
        (bull if row["cagr_3y"] >= 10 else bear if row["cagr_3y"] < 5 else []).append(point)

    for signal in trend["signals"]:
        if signal["direction"] in ("expanding", "accelerating"):
            bull.append({"claim": signal["text"], "evidence": "Calculated from reported numbers", "caveat": "One trend, not a forecast"})
        elif signal["direction"] in ("compressing", "slowing"):
            bear.append({"claim": signal["text"], "evidence": "Calculated from reported numbers", "caveat": "One trend, not a forecast"})

    level = cash["verdict"]["level"]
    if level == "strong":
        bull.append({"claim": cash["verdict"]["text"], "evidence": "Cash flow statement", "caveat": "Measured over the last five years"})
    elif level in ("watch", "weak"):
        bear.append({"claim": cash["verdict"]["text"], "evidence": "Cash flow statement", "caveat": "Measured over the last five years"})

    # A newly listed or barely reporting company can have no balance sheet columns at all.
    debt_equity = next(iter(balance["ratio_table"][0]["values"]), None) if balance["ratio_table"] else None
    if debt_equity is not None and not balance["is_financial"]:
        if debt_equity < 0.3:
            bull.append({"claim": f"Low debt: {debt_equity}x net worth", "evidence": "Latest balance sheet", "caveat": "Doesn't include off-balance-sheet items"})
        elif debt_equity > 1:
            bear.append({"claim": f"High debt: {debt_equity}x net worth", "evidence": "Latest balance sheet", "caveat": "Depends on the sector's normal level"})

    return {"bull_case": bull[:5], "bear_case": bear[:5]}
