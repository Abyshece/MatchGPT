import './index.css';
import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import { startNativeApp } from './lib/nativeApp';

// The website's account-deletion page (Google Play asks for one), on its own
const DeleteAccountPage = lazy(() => import('./components/DeleteAccountPage'));
const onDeletePage = !Capacitor.isNativePlatform() && /^\/delete-account\/?$/.test(window.location.pathname);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

console.log('MatchGPT Application Mounted');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {onDeletePage ? (
      <Suspense fallback={null}>
        <DeleteAccountPage />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
startNativeApp();  // inside the Android/iOS app only
