import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

function rewriteAgentPath(path: string) {
  const suffix = path.replace(/^\/api\/v1\/agent/, '')
  return suffix === '/health' ? '/health' : `/v1${suffix}`
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const hmrHost = env.VITE_HMR_HOST?.trim()
  const hmrDisabled = env.VITE_HMR_DISABLED?.trim().toLowerCase() === 'true'
  const agentTarget = env.VITE_AGENT_TARGET?.trim()
  const configuredHmrPort = Number.parseInt(env.VITE_HMR_CLIENT_PORT || '', 10)
  const hmrClientPort = Number.isInteger(configuredHmrPort) && configuredHmrPort > 0
    ? configuredHmrPort
    : undefined

  return {
    base: '/M3/',
    plugins: [vue()],
    publicDir: 'public',
    server: {
      host: '0.0.0.0', // 允许外部访问
      port: 25173,
      strictPort: true, // 端口被占用时不尝试其他端口
      // 私网默认由浏览器当前地址推导 HMR；仅公网远程调试时显式覆盖。
      ...(hmrDisabled ? { hmr: false } : hmrHost ? {
        hmr: {
          protocol: env.VITE_HMR_PROTOCOL === 'wss' ? 'wss' as const : 'ws' as const,
          host: hmrHost,
          ...(hmrClientPort ? { clientPort: hmrClientPort } : {}),
        },
      } : {}),
      proxy: {
        // Keep the standalone Agent service reachable during local development.
        '/api/v1/agent': {
          target: agentTarget || env.VITE_GATEWAY_TARGET || 'http://localhost:28000',
          changeOrigin: true,
          ...(agentTarget ? { rewrite: rewriteAgentPath } : {}),
        },
        '/api': {
          target: env.VITE_GATEWAY_TARGET || 'http://localhost:28000',
          changeOrigin: true
        },
        '/services': {
          target: env.VITE_GATEWAY_TARGET || 'http://localhost:28000',
          changeOrigin: true
        },
        // AI检测服务代理
        '/M3/ai-detect': {
          target: 'http://localhost:8002',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/M3\/ai-detect/, '')
        },
        // AI检测热力图代理
        '/M3/ai-heatmap': {
          target: 'http://localhost:8002',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/M3\/ai-heatmap/, '/heatmap')
        },
        // 谣言检测服务代理
        '/M3/rumor': {
          target: 'http://localhost:8010',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/M3\/rumor/, '')
        },
        // 视频分析服务代理
        '/M3/video-analysis/module1': {
          target: 'http://localhost:28003',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/M3\/video-analysis/, '/video_analysis')
        },
        '/M3/video-analysis/module2': {
          target: 'http://localhost:28003',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/M3\/video-analysis/, '/video_analysis')
        },
        '/M3/video-proxy/module3': {
          target: 'http://localhost:28003',
          changeOrigin: true,
          rewrite: (path) => path.replace('/M3/video-proxy/module3', '/video_analysis/module3/videos/')
        },
        '/M3/video-proxy/module2': {
          target: 'http://localhost:28003',
          changeOrigin: true,
          rewrite: (path) => path.replace('/M3/video-proxy/module2', '/video_analysis/module2/videos')
        },
        '/M3/video-proxy/module1': {
          target: 'http://localhost:28003',
          changeOrigin: true,
          rewrite: (path) => path.replace('/M3/video-proxy/module1', '/video_analysis/module1/videos')
        },
        // 统一模块3路由代理
        '/M3/video-analysis/module3': {
          target: 'http://localhost:28003',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/M3\/video-analysis/, '/video_analysis')
        }
      },
      watch: hmrDisabled ? null : {
        usePolling: true,
        interval: 500,
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
  }
})
