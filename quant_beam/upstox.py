"""Read-only Upstox account view.

THIS MODULE CAN ONLY READ. There is no code here that places, changes or
cancels an order, and none will be added. Place trades yourself in the Upstox app.

Your access token is read ONLY from the UPSTOX_ACCESS_TOKEN environment
variable. Never put it in a file in this repo: the repo is public.

    export UPSTOX_ACCESS_TOKEN="..."      # in your own terminal
    quant-beam account

Upstox tokens expire daily, so you will be asked to paste a fresh one each day.
"""

import json
import os
import urllib.error
import urllib.request

BASE = "https://api.upstox.com/v2"
# Every endpoint below is a GET that only reads. Nothing here can trade.
ENDPOINTS = {
    "funds": "/user/get-funds-and-margin?segment=SEC",
    "holdings": "/portfolio/long-term-holdings",
    "positions": "/portfolio/short-term-positions",
    "trades_today": "/order/trades/get-trades-for-day",
}


class UpstoxError(RuntimeError):
    pass


def available():
    return bool(os.environ.get("UPSTOX_ACCESS_TOKEN"))


def get(path, timeout=20):
    token = os.environ.get("UPSTOX_ACCESS_TOKEN")
    if not token:
        raise UpstoxError("UPSTOX_ACCESS_TOKEN is not set in this terminal")
    request = urllib.request.Request(
        BASE + path, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        raise UpstoxError(f"{path}: HTTP {error.code} {detail}")
    except (OSError, ValueError) as error:
        raise UpstoxError(f"{path}: {error}")
    if payload.get("status") != "success":
        raise UpstoxError(f"{path}: {payload.get('errors') or payload}")
    return payload.get("data")


def snapshot(fetch=get):
    """Funds, holdings, positions and today's trades, or an error per section."""
    result = {}
    for name, path in ENDPOINTS.items():
        try:
            result[name] = {"data": fetch(path)}
        except UpstoxError as error:
            result[name] = {"error": str(error)}
    return result


def summarise(snap):
    """Plain numbers from a snapshot: cash, holdings value, open profit or loss."""
    out = {"cash": None, "holdings_value": 0.0, "holdings_pnl": 0.0, "positions_pnl": 0.0,
           "holdings": [], "positions": [], "errors": {}}
    for name, section in snap.items():
        if "error" in section:
            out["errors"][name] = section["error"]

    funds = (snap.get("funds") or {}).get("data") or {}
    equity = funds.get("equity") or {}
    if equity:
        out["cash"] = equity.get("available_margin")

    for holding in ((snap.get("holdings") or {}).get("data") or []):
        quantity = holding.get("quantity") or 0
        last = holding.get("last_price") or 0.0
        average = holding.get("average_price") or 0.0
        value = quantity * last
        out["holdings_value"] += value
        out["holdings_pnl"] += (last - average) * quantity
        out["holdings"].append({
            "symbol": holding.get("tradingsymbol") or holding.get("trading_symbol"),
            "quantity": quantity, "average_price": average, "last_price": last, "value": value,
            "return": (last / average - 1) if average else None,
        })

    for position in ((snap.get("positions") or {}).get("data") or []):
        out["positions_pnl"] += position.get("pnl") or 0.0
        out["positions"].append({
            "symbol": position.get("tradingsymbol") or position.get("trading_symbol"),
            "quantity": position.get("quantity"), "pnl": position.get("pnl"),
            "average_price": position.get("average_price"), "last_price": position.get("last_price"),
        })

    trades = (snap.get("trades_today") or {}).get("data") or []
    out["trades_today"] = [{
        "symbol": t.get("tradingsymbol") or t.get("trading_symbol"),
        "side": t.get("transaction_type"), "quantity": t.get("quantity"),
        "price": t.get("average_price") or t.get("price"), "time": t.get("order_timestamp") or t.get("exchange_timestamp"),
    } for t in trades]
    return out
