import React from 'react';
import { SUPPORT_EMAIL } from './helpTopics';
import { reportError } from '../lib/errorReports';

// ============================================================================
// AppErrorBoundary: when something breaks while drawing a screen, a way out
// instead of a blank page. Reload usually fixes it; the address is there if
// it doesn't. The error goes to Admin → Errors.
// ============================================================================

interface State {
  failed: boolean;
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[Shaadi24] a screen failed', error);
    reportError(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-white dark:bg-[#191919] text-gray-900 dark:text-gray-100">
        <div className="text-4xl" aria-hidden="true">💍</div>
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 max-w-sm">
          Shaadi24 couldn't show this screen. Reloading usually fixes it. If it keeps happening, write to{' '}
          <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="h-11 px-6 rounded-md text-sm font-semibold bg-black text-white dark:bg-white dark:text-black"
        >
          Reload
        </button>
      </div>
    );
  }
}

export default AppErrorBoundary;
