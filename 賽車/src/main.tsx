import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

// Intercept global unhandled promise rejections across all browser events & async tasks
const handleGlobalUnhandledRejection = (event: PromiseRejectionEvent) => {
  console.warn('[Global] Intercepted unhandled promise rejection:', event?.reason);
  if (event) {
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  }
  return true;
};

window.addEventListener('unhandledrejection', handleGlobalUnhandledRejection, true);
window.addEventListener('unhandledrejection', handleGlobalUnhandledRejection, false);
window.onunhandledrejection = handleGlobalUnhandledRejection as any;

console.log("[Giga Racer 3D] Mounting React application...");

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
} else {
  console.error("[Giga Racer 3D] Failed to locate #root container element.");
}

