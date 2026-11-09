import { HashRouter } from 'react-router-dom';
import { AppRoutes } from './router';

/** HashRouter works under Electron `file://` and on any static web host without rewrite rules. */
export function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
