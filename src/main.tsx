import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import Painel from './painel.tsx'
import './index.css'

const path = window.location.pathname
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {path === '/painel' ? <Painel /> : <App />}
  </React.StrictMode>,
)

// PWA - Só registra em PRODUÇÃO (Vercel), não no localhost:5173
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('PWA Geoclima Vale registrado:', reg.scope))
      .catch(err => console.log('Erro PWA:', err))
  })
}