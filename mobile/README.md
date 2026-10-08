# Quant-beam mobile

Expo (React Native) app for iOS and Android: sign-in, live prices, the oil and lithium value chain, and paper trades that update live.

## Run it on your phone

```bash
cd mobile
bash setup.sh
open -e .env
npx expo start
```

- `bash setup.sh` runs once.
- `open -e .env` opens the settings file. Paste the same URL and anon key that are in the repo-root `.env`.

Install **Expo Go** from the App Store or Play Store and scan the QR code. Your phone must be on the same Wi-Fi as your computer.

Before the first run:
1. In Supabase, open **SQL Editor** and run `supabase/migrations/002_mobile.sql`.
2. Under **Authentication → URL Configuration → Redirect URLs**, add `exp://**` and `quantbeam://**`.
3. Deploy the delete-account function. Either run `npx supabase functions deploy delete-account --project-ref <ref>`, or go to **Edge Functions → Deploy a new function**, name it `delete-account`, and paste in `supabase/functions/delete-account/index.ts`.

## Screens

| Tab | What it does |
| --- | --- |
| Markets | NIFTY / S&P 500 / BTC live price (Yahoo, every 15 s), quantum beam, pipeline status |
| Chain | Oil and lithium segments → companies → company detail with live price and **paper buy/sell** |
| Trades | Open session, positions with live P&L, history. Updates in real time |
| Account | Profile, activity, privacy policy, sign out, **delete account** |

Release steps are in [RELEASE.md](RELEASE.md).
