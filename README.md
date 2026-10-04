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

## Phone apps (Android and iPhone)

The apps are the same React code inside native shells made by
[Capacitor](https://capacitorjs.com) (`capacitor.config.ts`, `android/`,
`ios/`). `lib/nativeApp.ts` holds what only the apps do: the Android back
button, the status and gesture bar colours, the iPhone's notch and home bar
(with `index.css`), the launch screen. Inside the apps MatchGPT+ is sold
through Google Play and the App Store, never Razorpay (`lib/storePurchases.ts`,
`components/StoreUpgrade.tsx`; the server checks each purchase with the store),
once the subscriptions are set up in the stores (ROADMAP.md, Phase 13); until
then it says "coming soon". Notifications come through Firebase Cloud Messaging
(`lib/nativePush.ts`; the server sends them from `send-push`) once the app has
its Firebase files: `android/app/google-services.json` and, added to the App
target in Xcode, `ios/App/App/GoogleService-Info.plist` (Firebase console →
Project settings → Your apps). Without them the app builds and runs, and says
notifications are coming soon. Google sign-in says "coming soon" until its phone
version exists; sign-in by email works.

Both apps need the live Supabase URL and anon key in `.env.production.local`
(same names as in `.env.local`; Supabase → Project Settings → API); the build
bakes them into the app.

**Android** needs Node.js 22, JDK 21 and the Android SDK (platform 36,
build-tools 36); Android Studio installs the SDK.

1. `npm run build:android` builds the app and copies it into `android/`.
2. `cd android && ./gradlew assembleDebug`, or open `android/` in Android
   Studio and press Run. The test app lands in
   `android/app/build/outputs/apk/debug/app-debug.apk`.

**iPhone** needs a Mac with Xcode (free, Mac App Store) and Node.js 22. The
project uses Swift Package Manager, so there is no CocoaPods step.

1. `npm run build:ios` builds the app and copies it into `ios/`.
2. `npx cap open ios` opens it in Xcode. Pick an iPhone simulator at the top
   and press Run (▶). For your own iPhone: plug it in and pick it instead,
   choose your Apple ID under Signing & Capabilities → Team, and turn on
   Developer Mode on the phone (Settings → Privacy & Security).

After any code change, run the build command again before Run.

`com.matchgpt.app` (in `capacitor.config.ts`, `android/app/build.gradle` and
the Xcode project) is the app's ID on Google Play and the App Store; it can't
change after the first upload.
