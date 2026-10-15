import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base must match the GitHub repo name (https://<user>.github.io/conflict-atlas/)
export default defineConfig({
  plugins: [react()],
  base: '/',
})
