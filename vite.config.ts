import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev
export default defineConfig({
  plugins: [react()],
  base: '/race-game/', // 這行能修正你一直轉圈圈、找不到 3D 資源的問題
})
