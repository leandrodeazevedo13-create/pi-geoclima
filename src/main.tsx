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

// PWA - Registra Service Worker para virar app no Chrome
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('PWA Geoclima Vale registrado:', reg.scope))
      .catch(err => console.log('Erro PWA:', err))
  })
}