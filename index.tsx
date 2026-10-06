import './index.css';
import React, { Suspense } from 'react';
import { lazyScreen } from './lib/lazyScreen';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import { startNativeApp } from './lib/nativeApp';
import { isWebsite } from './lib/website';
import { startErrorReports } from './lib/errorReports';

// Pages of the website that stand on their own: account deletion (Google
// Play asks for one) and support (the stores' Support URL)
const PAGES = new Map<string, React.LazyExoticComponent<React.FC>>([
  ['delete-account', lazyScreen(() => import('./components/DeleteAccountPage'))],
  ['support', lazyScreen(() => import('./components/SupportPage'))],
]);
const Page = Capacitor.isNativePlatform() ? undefined : PAGES.get(window.location.pathname.replace(/^\/|\/$/g, ''));
// Everywhere else on the website: the home page, legal pages and admin panel
// (members use the apps; lib/website.ts)
const Website = lazyScreen(() => import('./components/website/Website'));

// Errors nobody caught go to Admin → Errors (lib/errorReports.ts)
startErrorReports();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

console.log('Shaadi24 Application Mounted');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      {Page ? (
        <Suspense fallback={null}>
          <Page />
        </Suspense>
      ) : isWebsite() ? (
        <Suspense fallback={null}>
          <Website />
        </Suspense>
      ) : (
        <App />
      )}
    </AppErrorBoundary>
  </React.StrictMode>
);
startNativeApp();  // inside the Android/iOS app only
