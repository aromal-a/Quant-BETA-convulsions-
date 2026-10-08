# v2: Demo + Live trading

| | Demo | Live |
| --- | --- | --- |
| Money | Pretend, fills instantly at the shown price | Your own broker account, market orders |
| Who holds funds | Nobody | The broker (Alpaca, Upstox, Binance). Quant-beam never does |
| Minimum | $2 | $2 on Alpaca · per-coin minimum on Binance (often $5) · 1 share on Upstox |
| Maximum | — | Your buying power at the broker (checked before every order) |
| Not enough money | — | Order blocked in-app: "Add funds in {broker}" |
| Recorded | Every trade | Only real fills reported by the broker |

**Trades → Wins & losses by chain** splits closed trades by chain segment and by the margin trend at the time you bought (expanding / shrinking / leak). Compare Demo and Live with the switch.

## Setup (sandbox first: no real money)

1. Supabase SQL Editor: run `supabase/migrations/003_live_trading.sql`.
2. **Alpaca:**
   - Create an OAuth app at alpaca.markets (Connect).
   - Redirect URL: `https://<ref>.supabase.co/functions/v1/broker-oauth/alpaca`
3. **Upstox:**
   - Create an app at developer.upstox.com.
   - Redirect URL: `https://<ref>.supabase.co/functions/v1/broker-oauth/upstox`
   - Run `python scripts/build_upstox_map.py` and push `docs/data/upstox_instruments.json`.
4. **Secrets.** Run these from your terminal only; they never go in a file:
   ```bash
   npx supabase login
   npx supabase secrets set --project-ref <ref> ALPACA_CLIENT_ID=... ALPACA_CLIENT_SECRET=... UPSTOX_CLIENT_ID=... UPSTOX_CLIENT_SECRET=...
   npx supabase functions deploy broker-oauth --no-verify-jwt --project-ref <ref>
   ```
5. In `mobile/.env`, add the two **client IDs** (not secrets). Keep `EXPO_PUBLIC_BROKER_ENV=sandbox`.
6. **Binance testnet:** create a key at testnet.binance.vision, then paste it in the app under **Account → Manage brokers**.
7. Restart with `npx expo start -c`.

## Going to real money
- Set `EXPO_PUBLIC_BROKER_ENV=production` in the EAS environment.
- Real-money builds need: a registered company (Apple requires the submitting account to be a legal entity for trading apps), the brokers' approval for third-party apps (Alpaca's Broker API or OAuth review, Upstox app approval), and Google Play's Financial features declaration.
- Until those are done, ship with `EXPO_PUBLIC_LIVE_TRADING=off` (Demo only).
