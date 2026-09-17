"""What the Quant-beam re-reads.

Country markets (local indexes + big stocks) are grouped by country so the
web page can show the viewer's own country first. Crypto is kept separate,
priced in USD, with Tether (USDT) tracked as the dollar peg.
"""

COUNTRIES = {
    "IN": {
        "name": "India",
        "currency": "INR",
        "timezone": "Asia/Kolkata",
        "periods_per_year": 252,
        "symbols": {
            "^NSEI": "NIFTY 50",
            "^BSESN": "SENSEX",
            "RELIANCE.NS": "Reliance Industries",
            "TCS.NS": "Tata Consultancy Services",
            "INFY.NS": "Infosys",
        },
    },
    "US": {
        "name": "United States",
        "currency": "USD",
        "timezone": "America/New_York",
        "periods_per_year": 252,
        "symbols": {
            "^GSPC": "S&P 500",
            "^IXIC": "Nasdaq Composite",
            "AAPL": "Apple",
            "NVDA": "NVIDIA",
            "TSLA": "Tesla",
        },
    },
}

CRYPTO = {
    "name": "Crypto",
    "currency": "USD",
    "periods_per_year": 365,
    "symbols": {
        "BTC-USD": "Bitcoin",
        "ETH-USD": "Ethereum",
        "SOL-USD": "Solana",
        "USDT-USD": "Tether (USD peg)",
    },
}

# Symbols whose price is meant to stay at 1.00 USD.
PEGGED = {"USDT-USD": 1.0}
