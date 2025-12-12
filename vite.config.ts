import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode`.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // Prioritize system env var (Docker ARG) over .env file
  const apiKey = process.env.API_KEY || env.API_KEY;

  return {
    plugins: [react()],
    define: {
      // Expose API_KEY to the client-side code via process.env.API_KEY replacement
      'process.env.API_KEY': JSON.stringify(apiKey),
      // Prevent crash if code accesses process.env elsewhere without a specific key
      'process.env': {}
    }
  }
})