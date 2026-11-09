import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/components.css';
import '@/styles/layout.css';
import '@/styles/features.css';
import { DataSourceProvider } from '@/lib/api/datasource';
import { UIProvider } from '@/app/ui-state';
import { ToastProvider } from '@/components/ui';
import { App } from '@/app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataSourceProvider>
      <UIProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </UIProvider>
    </DataSourceProvider>
  </StrictMode>,
);
