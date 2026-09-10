import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

const isLegacyGitHubPages = window.location.hostname.toLowerCase() === 'falkinou.github.io'

if (isLegacyGitHubPages) {
  window.location.replace(`https://drive.mycloudapi.fr/${window.location.search}${window.location.hash}`)
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    })
  }
}
