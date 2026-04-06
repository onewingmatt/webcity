import { defineConfig } from 'vite'

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/webcity/' : '/',
  server: {
    port: 5173
  }
})
