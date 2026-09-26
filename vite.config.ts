import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Only VITE_-prefixed env vars reach the browser (via import.meta.env).
// Don't add a `define` for secrets here: whatever it injects ends up in the
// public bundle.
export default defineConfig({
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
