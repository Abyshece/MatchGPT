import './index.css';
import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import { startNativeApp } from './lib/nativeApp';

// Pages of the website that stand on their own: account deletion (Google
// Play asks for one) and support (the stores' Support URL)
const PAGES = new Map<string, React.LazyExoticComponent<React.FC>>([
  ['delete-account', lazy(() => import('./components/DeleteAccountPage'))],
  ['support', lazy(() => import('./components/SupportPage'))],
]);
const Page = Capacitor.isNativePlatform() ? undefined : PAGES.get(window.location.pathname.replace(/^\/|\/$/g, ''));

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

console.log('MatchGPT Application Mounted');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {Page ? (
      <Suspense fallback={null}>
        <Page />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
startNativeApp();  // inside the Android/iOS app only
