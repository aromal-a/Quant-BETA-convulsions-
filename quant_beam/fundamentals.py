"""Quarterly profit margins from company filings (via Yahoo Finance's fundamentals feed)."""

import json
import time
import urllib.parse
import urllib.request

from .fetch import HEADERS, FetchError

URL = ("https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{symbol}"
       "?type={types}&period1={start}&period2={end}")
FIELDS = ("TotalRevenue", "GrossProfit", "OperatingIncome", "NetIncome")


def fetch_quarters(symbol, retries=3, timeout=20):
    """Return quarters oldest-first: [{"date", "revenue", "gross", "operating", "net"}]."""
    types = ",".join("quarterly" + f for f in FIELDS)
    url = URL.format(symbol=urllib.parse.quote(symbol), types=types,
                     start=int(time.time()) - 3 * 365 * 86400, end=int(time.time()))
    last_error = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=timeout) as response:
                return parse_quarters(json.load(response), symbol)
        except (OSError, ValueError, KeyError) as error:
            last_error = error
            time.sleep(2 ** attempt)
    raise FetchError(f"{symbol}: {last_error}")


def parse_quarters(payload, symbol):
    names = {"TotalRevenue": "revenue", "GrossProfit": "gross", "OperatingIncome": "operating", "NetIncome": "net"}
    by_date = {}
    for series in payload["timeseries"]["result"]:
        kind = series["meta"]["type"][0]
        field = names.get(kind.replace("quarterly", ""))
        for point in series.get(kind) or []:
            if point and point.get("reportedValue"):
                by_date.setdefault(point["asOfDate"], {})[field] = point["reportedValue"]["raw"]
    quarters = [{"date": d, **v} for d, v in sorted(by_date.items()) if v.get("revenue")]
    if not quarters:
        raise FetchError(f"{symbol}: no quarterly figures")
    return quarters


def margins(quarter):
    revenue = quarter["revenue"]
    ratio = lambda key: quarter[key] / revenue if quarter.get(key) is not None and revenue else None
    return {"gross": ratio("gross"), "operating": ratio("operating"), "net": ratio("net")}


def year_ago(quarters, latest):
    """The quarter about one year before `latest` (same fiscal quarter)."""
    year, rest = int(latest["date"][:4]), latest["date"][4:]
    target = f"{year - 1}{rest}"
    return next((q for q in quarters if q["date"][:7] == target[:7]), None)


def margin_report(quarters):
    """Latest-quarter margins, the change vs a year earlier, and where any leak came from.

    Operating margin = gross margin - operating-cost ratio, so a fall in operating
    margin is split into "pricing/input squeeze" (gross margin fell) and "cost
    leak" (operating costs grew faster than revenue).
    """
    latest = quarters[-1]
    before = year_ago(quarters, latest)
    now = margins(latest)
    report = {"quarter": latest["date"], "revenue": latest["revenue"], "margins": now,
              "compare_quarter": None, "revenue_growth": None, "change": None, "leak": None}
    if not before:
        return report
    then = margins(before)
    change = {k: (now[k] - then[k]) if now[k] is not None and then[k] is not None else None for k in now}
    report.update({
        "compare_quarter": before["date"],
        "revenue_growth": latest["revenue"] / before["revenue"] - 1 if before["revenue"] else None,
        "margins_year_ago": then,
        "change": change,
    })
    if change["operating"] is not None and change["operating"] <= -0.02:
        squeeze = change["gross"] if change["gross"] is not None else 0.0
        cost_leak = change["operating"] - squeeze
        report["leak"] = {
            "operating_margin_drop": change["operating"],
            "from_gross_squeeze": squeeze,
            "from_cost_growth": cost_leak,
            "main_cause": "cost growth" if cost_leak < squeeze else "gross margin squeeze",
        }
    return report
