import path from 'path';
import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const { version } = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));

// Only VITE_-prefixed env vars reach the browser (via import.meta.env).
// Don't add a `define` for secrets here: whatever it injects ends up in the
// public bundle.
export default defineConfig({
    // The app's version (package.json; the stores' too), shown in Settings
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
});
