import axios from 'axios'
import type { AxiosResponse } from 'axios'

// 创建axios实例
const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    // 添加CSRF token (如果需要)
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')
    if (csrfToken) {
      config.headers['X-CSRFToken'] = csrfToken
    }
    
    console.log('API请求:', {
      url: config.url,
      method: config.method,
      data: config.data
    })
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
api.interceptors.response.use(
  (response: AxiosResponse) => {
    console.log('API响应:', {
      url: response.config.url,
      status: response.status,
      data: response.data
    })
    return response
  },
  (error) => {
    console.error('API错误:', {
      url: error.config?.url,
      status: error.response?.status,
      message: error.message,
      data: error.response?.data
    })
    
    // 统一错误处理
    if (error.response?.status === 401) {
      // 处理认证失败
      console.warn('认证失败，请重新登录')
    }
    return Promise.reject(error)
  }
)

// === AI图像检测API ===

export const aiImageAPI = {
  /**
   * AI图像检测
   * @param file 图像文件
   * @returns 检测结果
   */
  analyzeImage: async (file: File) => {
    const formData = new FormData()
    formData.append('image', file)
    
    // 使用Vite代理，避免CORS问题
    const response = await fetch('/ai-detect/detect', {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || '检测失败')
    }
    
    return await response.json()
  },

  /**
   * 获取AI检测结果
   * @param detectionId 检测ID
   * @returns 检测结果详情
   */
  getDetectionResult: async (detectionId: string) => {
    const response = await api.get(`/ai-image/result/${detectionId}`)
    return response.data
  },

  /**
   * 获取AI检测服务状态
   * @returns 服务状态信息
   */
  getServiceStatus: async () => {
    try {
      // 使用代理检查AI检测服务状态
      const aiResponse = await fetch('/ai-detect/health')
      const aiStatus = await aiResponse.json()
      
      return {
        services: {
          ai_image_detection: {
            name: 'AI图像检测服务',
            status: aiStatus.status === 'healthy' ? 'healthy' : 'unhealthy',
            url: 'http://localhost:8002'
          },
          rumor_detection: {
            name: '图文谣言检测服务',
            status: 'unhealthy',
            url: 'http://localhost:8010'
          },
          video_analysis_module1: {
            name: '视频分析模块1',
            status: 'unhealthy',
            url: 'http://localhost:8003'
          },
          video_analysis_module2: {
            name: '视频分析模块2',
            status: 'unhealthy',
            url: 'http://localhost:8004'
          }
        },
        completed_detections_24h: 0, // 实际环境中需要从数据库获取
        success_rate: 100.0,
        model_version: 'SAFE-v2.1.0'
      }
    } catch (error) {
      // 如果服务不可用，返回默认状态
      return {
        services: {
          ai_image_detection: {
            name: 'AI图像检测服务',
            status: 'unhealthy',
            url: 'http://localhost:8002'
          },
          rumor_detection: {
            name: '图文谣言检测服务',
            status: 'unhealthy',
            url: 'http://localhost:8010'
          },
          video_analysis_module1: {
            name: '视频分析模块1',
            status: 'unhealthy',
            url: 'http://localhost:8003'
          },
          video_analysis_module2: {
            name: '视频分析模块2',
            status: 'unhealthy',
            url: 'http://localhost:8004'
          }
        },
        completed_detections_24h: 0,
        success_rate: 0,
        model_version: 'SAFE-v2.1.0'
      }
    }
  }
}

// === 谣言检测API ===

export const rumorAPI = {
  /**
   * 谣言检测（图文结合，必须传文本和图片）
   * @param data 检测数据
   * @returns 检测结果
   */
  analyze: async (data: { text: string; image: File }) => {
    const formData = new FormData()
    formData.append('content', data.text)
    formData.append('image', data.image)
    console.log(formData)
    const response = await fetch('/rumor/detect', {
      method: 'POST',
      body: formData
    })
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || '检测失败')
    }
    return await response.json()
  }
}

// === 视频分析API ===

export const videoAPI = {
  /**
   * 视频分析
   * @param moduleId 模块ID (1 或 2)
   * @param data 分析数据
   * @returns 分析结果
   */
  analyzeVideo: async (moduleId: number, data: { video: File }) => {
    const formData = new FormData()
    formData.append('video', data.video)
    
    const response = await api.post(`/video-analysis/module${moduleId}/detect`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      timeout: 120000 // 视频分析需要更长时间
    })
    return response.data
  }
}

// === 系统状态API ===

export const systemAPI = {
  /**
   * 获取所有模块状态
   * @returns 模块状态列表
   */
  getModulesStatus: async () => {
    const response = await api.get('/modules/status/')
    return response.data
  },

  /**
   * 获取检测结果 (通用)
   * @param detectionId 检测ID
   * @returns 检测结果
   */
  getDetectionResult: async (detectionId: string) => {
    const response = await api.get(`/result/${detectionId}/`)
    return response.data
  }
}

export default api 