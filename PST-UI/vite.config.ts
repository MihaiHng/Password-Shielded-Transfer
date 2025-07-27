import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  //base: '/', // This is the recommended setting for Netlify root deployments, this is also the default value if removed or commented
  plugins: [react()],
})
