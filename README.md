<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1Xk80cjHi5tLoczlhkA9xWpLdNVq9uRW8

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy [.env.local.example](.env.local.example) to `.env.local` and fill in your Supabase values
3. Run the app:
   `npm run dev`

Project status and what's left to build: see [ROADMAP.md](ROADMAP.md).

## Android app

The Android app is the same React code inside a native shell made by
[Capacitor](https://capacitorjs.com) (`capacitor.config.ts`, `android/`).
`lib/nativeApp.ts` holds what only the apps do: the back button, the status
and gesture bar colours, the launch screen. Inside the app, Google sign-in,
MatchGPT+ payments and notifications say "coming soon" until their phone
versions exist (Google's own sign-in, Google Play billing, Firebase
notifications); sign-in by email works.

**Prerequisites:** Node.js 22, JDK 21 and the Android SDK (platform 36,
build-tools 36). Android Studio installs the SDK.

1. Put the live Supabase URL and anon key in `.env.production.local` (same
   names as in `.env.local`); the build bakes them into the app.
2. `npm run build:android` builds the website and copies it into `android/`.
3. `cd android && ./gradlew assembleDebug`, or open `android/` in Android
   Studio and press Run. The test app lands in
   `android/app/build/outputs/apk/debug/app-debug.apk`.

`com.matchgpt.app` in `capacitor.config.ts` and `android/app/build.gradle` is
the app's Play Store ID; it can't change after the first upload.
