import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/ConfirmDialog';
import { db } from './db/schema';

function fatal(message: string) {
  const root = document.getElementById('root')!;
  root.innerHTML = '';
  const p = document.createElement('p');
  p.style.cssText = 'padding:24px;font:16px system-ui';
  p.textContent = message;
  root.appendChild(p);
}

db.open()
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ToastProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </ToastProvider>
      </StrictMode>,
    );
  })
  .catch((err) => {
    console.error(err);
    fatal(
      'Could not open local storage. If you are in Private Browsing, switch to a normal tab. Your data has not been deleted.',
    );
  });
