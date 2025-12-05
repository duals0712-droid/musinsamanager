import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const splash = document.getElementById('splash');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (splash) {
  setTimeout(() => splash.remove(), 50);
}
