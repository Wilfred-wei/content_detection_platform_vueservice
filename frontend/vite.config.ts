import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  publicDir: 'public',
  server: {
    port: 25173,
    proxy: {
      '/api': {
        target: 'http://localhost:28000',
        changeOrigin: true
      },
      '/services': {
        target: 'http://localhost:28000',
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
      },
      // 添加视频分析服务代理
      '/video-analysis/module1': {
        target: 'http://localhost:28003',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/video-analysis/, '/video_analysis')
      },
      '/video-analysis/module2': {
        target: 'http://localhost:28003',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/video-analysis/, '/video_analysis')
      },
      '/video-proxy/module3': {
        target: 'http://localhost:28003',
        changeOrigin: true,
        rewrite: (path) => path.replace('/video-proxy/module3', '/video_analysis/module3/videos/')  // 关键修改点
      },
      '/video-proxy/module2': {
        target: 'http://localhost:28003',
        changeOrigin: true,
        rewrite: (path) => path.replace('/video-proxy/module2', '/video_analysis/module2/videos')  // 关键修改点
      },
      '/video-proxy/module1': {
        target: 'http://localhost:28003',
        changeOrigin: true,
        rewrite: (path) => path.replace('/video-proxy/module1', '/video_analysis/module1/videos')  // 关键修改点
      },

      // 统一模块3路由代理
      '/video-analysis/module3': {
        target: 'http://localhost:28003',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/video-analysis/, '/video_analysis')
      }
      
    },
    watch: {
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**',
        '**/logs/**'
      ]
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
}) 

