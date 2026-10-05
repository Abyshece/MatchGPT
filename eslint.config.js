// ESLint: `npm run lint` (CI runs it on every push and pull request).
// The app's own code: TypeScript's recommended rules and React's rules of hooks.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**', 'android/**', 'ios/**', 'node_modules/**',
      // Deno code, checked by `deno test` (CI)
      'supabase/functions/**',
      // Scripts and tests run by Node, not part of the app
      'scripts/**', 'tests/**', '*.config.{js,ts}', 'eslint.config.js',
      // The 18 prototype files the app never imports (tsconfig.json; ROADMAP.md, Phase 10)
      'components/AdminDashboard.tsx', 'components/AdminLogin.tsx', 'components/ChatSystem.tsx',
      'components/DateProposalModal.tsx', 'components/DeleteConfirmationModal.tsx', 'components/FilterModal.tsx',
      'components/MatchGrid.tsx', 'components/MatchLimitModal.tsx', 'components/MatchProfileModal.tsx',
      'components/PaymentModal.tsx', 'components/PhotoUpload.tsx', 'components/PlaceholderTab.tsx',
      'components/SearchArea.tsx', 'components/ShareModal.tsx', 'components/SocialVerificationModal.tsx',
      'components/SubscriptionModal.tsx', 'components/VerificationLockoutModal.tsx', 'services/matchingService.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      // Advice for React Compiler, which the app doesn't use: state set in an
      // effect costs one extra render here, and hand-written memos stay as written
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
  {
    // The website's service worker
    files: ['public/sw.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.serviceworker },
  },
);
