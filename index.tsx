import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { startNativeApp } from './lib/nativeApp';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

console.log('MatchGPT Application Mounted');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
startNativeApp();  // inside the Android/iOS app only
