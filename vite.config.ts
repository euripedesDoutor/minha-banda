import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Expose API_KEY to the client-side code via process.env.API_KEY replacement
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      // Prevent crash if code accesses process.env elsewhere without a specific key
      'process.env': {}
    }
  }
})