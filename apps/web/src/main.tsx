// Adaptateur PixiJS pour les pages qui interdisent la compilation dynamique.
import 'pixi.js/unsafe-eval';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';

const root = document.getElementById('app');
if (root) createRoot(root).render(<StrictMode><App /></StrictMode>);
