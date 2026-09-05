/* @refresh reload */
import './index.css';
import { render } from 'solid-js/web';
import 'solid-devtools';

import { App } from './App';
import { AccountsProvider } from './auth/accounts';
import { Router } from '@solidjs/router';

const root = document.getElementById('root');

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  );
}

// The router renders matched routes under its own root, so every context a route
// component reads must wrap the router, not sit beside the route definitions.
render(() => <AccountsProvider><Router><App /></Router></AccountsProvider>, root!);
