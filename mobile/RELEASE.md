# Release checklist: up to "Submit for review"

## Done in the code
- [x] Sign in with Apple on iOS. Apple requires it because Google sign-in is also offered.
- [x] In-app account deletion: **Account → Delete account**, using the Edge Function.
- [x] Privacy policy page at `docs/privacy.html`, linked in the app.
- [x] Session stored in the Keychain / Keystore only. No secrets in the repo.
- [x] Clear "paper trading, pretend money, not financial advice" wording.
- [x] `ITSAppUsesNonExemptEncryption: false`, which skips the export-compliance question.
- [x] Dark UI, portrait only, and 44 pt tap targets.

## You need to do
1. **Accounts:** Apple Developer Program ($99/yr) and Google Play Console ($25 one-time).
2. **Bundle ID:** `com.aromal.quantbeam` is in `app.json`. Change it now if you want a different one; it can't change after release.
3. **App icon:** add a 1024×1024 PNG with no transparency at `mobile/assets/icon.png`. Then add `"icon": "./assets/icon.png"` to `app.json`. Android also needs `"adaptiveIcon": {"foregroundImage": "./assets/icon.png", "backgroundColor": "#0a0c17"}`.
4. **Privacy policy:** replace `CONTACT_EMAIL` in `docs/privacy.html`. Turn on GitHub Pages from `/docs` (repo **Settings → Pages**). Check that https://aromal-a.github.io/Quant-BETA-convulsions-/privacy.html opens.
5. **Supabase for production:**
   - Turn **Confirm email** back on.
   - Add custom SMTP (Resend or SendGrid).
   - Delete the test users.
   - Enable the Apple and Google providers under **Authentication → Providers**.
6. **Build settings in EAS:** the cloud build can't see your `.env`, so give the build the two public values:
   ```bash
   npm i -g eas-cli && eas login && eas init
   eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co --environment production --environment preview --visibility plaintext
   eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key> --environment production --environment preview --visibility plaintext
   ```
7. **Test build on real phones:**
   ```bash
   eas build --profile preview --platform android
   eas build --profile production --platform ios
   eas submit --platform ios
   ```
   The Android build gives you an APK to install directly. The iOS commands upload to TestFlight.
8. **Store listings:**
   - Screenshots: 6.7" iPhone and Android phone.
   - Description and support URL (the repo is fine).
   - Category: Finance.
   - Age rating: 17+ / Mature, which is normal for trading simulators.
   - **App Privacy** (Apple) and **Data safety** (Google). Declare email, name and app activity, linked to the user, used for app functionality, and not used for tracking.
   - Google Play **Financial features** declaration: "simulated trading, no real money".
   - Reviewer note: give a demo account (email and password) and say "Paper trading only. No real orders or payments."
9. **Final step (you stop here):**
   ```bash
   eas build --profile production --platform all
   ```
   Then press **Submit for review** in App Store Connect and **Send for review** in Play Console.
