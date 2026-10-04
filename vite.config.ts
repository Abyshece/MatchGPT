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
    build: {
      rollupOptions: {
        output: {
          // The libraries in files of their own: they change far less often
          // than the app, so browsers keep them from one release to the next
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
            if (/node_modules\/(@supabase\/|iceberg-js\/)/.test(id)) return 'supabase';
            if (/node_modules\/@capacitor\//.test(id)) return 'capacitor';
            return undefined;
          },
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
});
