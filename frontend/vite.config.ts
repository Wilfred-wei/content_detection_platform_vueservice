import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      '/services': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      // 添加AI检测服务代理
      '/ai-detect': {
        target: 'http://localhost:8002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai-detect/, '')
      },
      // 添加谣言检测服务代理
      '/rumor': {
        target: 'http://localhost:8010',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rumor/, '')
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
}) 