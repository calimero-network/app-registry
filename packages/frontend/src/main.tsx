import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/components/Toast';
import { applyTheme, getStoredTheme } from '@/components/ThemeToggle';

// Before render, not in an effect: applying the theme after mount paints one
// frame in the wrong palette first, which reads as a flash on every load.
// index.html already stamps the default; this is what honours a stored
// choice, and it has to run before React paints anything.
applyTheme(getStoredTheme());
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      /**
       * ⚠️ WITHOUT THIS, `staleTime` IS 0 AND EVERY NAVIGATION REFETCHES.
       *
       * Data was considered stale the instant it arrived, so returning to a
       * page — or remounting a component that reads the same key — went back
       * to the network every time and redrew from a loading state. On this
       * registry a listing changes when somebody publishes, which is not on
       * the order of seconds, so half a minute of reuse makes going back and
       * forth instant and costs nothing anyone would notice.
       *
       * It does not weaken any write path: every mutation here invalidates the
       * keys it touched, and an invalidated query refetches regardless of how
       * fresh this says it is.
       */
      staleTime: 30_000,
      // Keep the previous answer in memory long enough that a round trip
      // through another page and back does not have to re-fetch at all.
      gcTime: 5 * 60_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename='/'>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
