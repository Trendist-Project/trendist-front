import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from './AdminApp';
import { Toaster } from '../ui/toast';
import '../styles.css';
import './admin.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminApp />
    <Toaster />
  </StrictMode>,
);
