import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import ReaderApp from './ReaderApp';
createRoot(document.getElementById('root')!).render(<StrictMode><ReaderApp /></StrictMode>);
