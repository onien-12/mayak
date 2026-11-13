import '@fontsource-variable/onest';
import '@fontsource-variable/unbounded';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { registerServiceWorker } from './app/registerServiceWorker';
import { startGraphicsProbe } from './shared/ui';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root is missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
startGraphicsProbe();
