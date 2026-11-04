import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { forceLang } from '../country';
import { AdminApp } from './AdminApp';
import { Toaster } from '../ui/toast';
import '../styles.css';
import './admin.css';

// 관리자는 항상 한국어(플레이어 화면의 나라 선택과 별개)
forceLang('ko');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminApp />
    <Toaster />
  </StrictMode>,
);
