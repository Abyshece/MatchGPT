// ============================================================================
// The phone apps (Capacitor: Android now, iOS later)
//
// The website and the apps run the same React code. isNativeApp() tells them
// apart; startNativeApp() (index.tsx) adds what only the apps need:
//   - the Android back button: closes the popup on top, else goes back a
//     screen (useBackHandler), else puts the app in the background
//   - status and gesture bar colours that follow the app's theme
//   - on iPhones, the page fills the screen under the notch and the home bar;
//     index.css keeps the content clear of them (--safe-top, --safe-bottom)
//   - hiding the launch screen once the app has drawn
// ============================================================================

import { useEffect, useRef } from 'react';
import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';

export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

// ---- Back button ------------------------------------------------------------

type BackHandler = () => boolean;  // true when it went back
const backHandlers: { priority: number; handler: BackHandler }[] = [];

/** Back-button priorities: a page opened on top of a tab goes back before the tab does. */
export const BACK = { PAGE: 20, TAB: 10 } as const;

/**
 * What the back button does while this screen is showing. The handler returns
 * true when it went back; the highest priority one that can go back wins.
 */
export function useBackHandler(priority: number, handler: BackHandler): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!isNativeApp()) return;
    const entry = { priority, handler: () => ref.current() };
    backHandlers.push(entry);
    return () => {
      const i = backHandlers.indexOf(entry);
      if (i >= 0) backHandlers.splice(i, 1);
    };
  }, [priority]);
}

// Open = on screen and taking taps. Not judged by opacity: popups fade in
// from 0, and back pressed in that moment must still close them. (The
// closed filters backdrop stays in the page, but ignores taps.)
const isShowing = (el: HTMLElement) => {
  const s = getComputedStyle(el);
  return el.getClientRects().length > 0 && s.visibility !== 'hidden' && s.pointerEvents !== 'none';
};

// The popup on top. Every popup sits on a .popup-backdrop; the full-screen
// ones without one (the photo viewer, "It's a Match!") carry data-popup.
function topPopup(): HTMLElement | null {
  const open = [...document.querySelectorAll<HTMLElement>('.popup-backdrop, [data-popup]')].filter(isShowing);
  const z = (el: HTMLElement) => Number.parseInt(getComputedStyle(el).zIndex, 10) || 0;
  // Highest z-index; of equals, the later one, which is drawn on top
  return open.reduce<HTMLElement | null>((top, el) => (!top || z(el) >= z(top) ? el : top), null);
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// Closes the top popup the way a person would: a tap outside its card, else
// its close button. True if there was a popup, even one that stays open (one
// busy paying, say): back never leaves a screen with a popup still on it.
async function closeTopPopup(): Promise<boolean> {
  const popup = topPopup();
  if (!popup) return false;
  popup.click();
  await nextFrame();
  if (popup.isConnected && topPopup() === popup) {
    popup.querySelector<HTMLElement>('[aria-label="Close"]')?.click();
  }
  return true;
}

async function onBackButton(): Promise<void> {
  if (await closeTopPopup()) return;
  // Highest priority first; of equals, the one registered last
  const ordered = backHandlers.map((h, i) => ({ ...h, i })).sort((a, b) => b.priority - a.priority || b.i - a.i);
  for (const { handler } of ordered) {
    if (handler()) return;
  }
  await App.minimizeApp();
}

// ---- Status and gesture bars --------------------------------------------------

// android/app/src/main/java/com/matchgpt/app/AppWindowPlugin.java
const AppWindow = registerPlugin<{ setTheme(options: { dark: boolean; color: string }): Promise<void> }>('AppWindow');
let currentDark: boolean | null = null;

/**
 * The status bar follows the app's theme: light text on the dark theme. On
 * Android the strips behind the status and gesture bars also take the app's
 * background colour; on iPhones the page itself runs under them.
 */
export function setNativeTheme(dark: boolean): void {
  currentDark = dark;
  const platform = Capacitor.getPlatform();
  if (platform === 'android') {
    AppWindow.setTheme({ dark, color: dark ? '#191919' : '#ffffff' }).catch(() => {});
  } else if (platform === 'ios') {
    SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
  }
}

// ---- Start ----------------------------------------------------------------------

export function startNativeApp(): void {
  if (!isNativeApp()) return;
  document.documentElement.classList.add('native-app');
  if (Capacitor.getPlatform() === 'ios') {
    // The page fills an iPhone's screen, under the notch (or Dynamic Island)
    // and the home bar. viewport-fit=cover makes the browser report their
    // sizes as env(safe-area-inset-*), which index.css keeps content clear of.
    document.querySelector('meta[name="viewport"]')
      ?.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
    document.documentElement.classList.add('native-ios');
  }
  App.addListener('backButton', () => { void onBackButton(); });
  // Android can repaint the bars itself (the phone switching to dark mode,
  // say); put the app's colours back when it returns to the front.
  App.addListener('resume', () => { if (currentDark !== null) setNativeTheme(currentDark); });
  // Two frames: React has drawn the first screen
  requestAnimationFrame(() => requestAnimationFrame(() => { SplashScreen.hide().catch(() => {}); }));
}
