import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { blocklistApiPlugin } from './vite.blocklist-api.js'

export default defineConfig({
  plugins: [react(), blocklistApiPlugin()],
  server: {
    // Allow opening sample landing + external pages against this origin
    cors: true,
  },
  preview: {
    // Railway (and similar) serve the app on a public hostname.
    allowedHosts: true,
  },
})
