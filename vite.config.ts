import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Ensure process.env.API_KEY doesn't crash the app during build or runtime
    'process.env': {}
  }
})