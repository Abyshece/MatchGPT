import type { CapacitorConfig } from '@capacitor/cli';

// ============================================================================
// The phone apps (Android and iPhone): the same React build as the website
// (dist/), inside native shells made by Capacitor.
//
//   npm run build:android     web build + copy into android/
//   cd android && ./gradlew assembleDebug    → app/build/outputs/apk/debug/
//   npm run build:ios         web build + copy into ios/ (on a Mac)
//   npx cap open ios          opens Xcode; press Run
//
// appId is the package name on Google Play (and the bundle ID on the App
// Store). It can't be changed once the app has been uploaded to a store.
// ============================================================================

const config: CapacitorConfig = {
  appId: 'com.shaadi24.app',
  appName: 'Shaadi24',
  webDir: 'dist',
  plugins: {
    // Hidden by the app as soon as it has drawn (lib/nativeApp.ts); the
    // timer is only a fallback.
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
    // Notifications (lib/nativePush.ts). On an iPhone with the app open, the
    // app shows them itself, so the phone doesn't too.
    FirebaseMessaging: {
      presentationOptions: [],
    },
    // Sign in with Google and with Apple (lib/socialSignIn.ts). The plugin
    // leaves the providers set to false (and their SDKs) out of the apps.
    SocialLogin: {
      providers: {
        google: true,
        apple: true,
        facebook: false,
        twitter: false,
      },
      logLevel: 1,
    },
  },
  // The Firebase plugin's Swift package is named "messaging", like a package
  // inside Firebase's own; linking it under its full name keeps them apart
  // (Capacitor CLI 8.4+).
  experimental: {
    ios: {
      spm: {
        packageOptions: {
          '@capacitor-firebase/messaging': { symlink: true },
        },
      },
    },
  },
};

export default config;
