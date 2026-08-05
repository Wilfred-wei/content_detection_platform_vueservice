import axios from 'axios'
import type { AxiosResponse } from 'axios'
import { getAssetPath } from '../utils/assetPath'
import type { AIDetectionServiceStatus } from '../types'

// 获取代理路径的辅助函数
const getProxyPath = (path: string): string => {
  // 开发环境通过 Vite 代理，生产环境通过 nginx 代理需要 base 路径
  const baseURL = import.meta.env.BASE_URL || '/'
  return `${baseURL}${path.startsWith('/') ? path.slice(1) : path}`
}

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
    const response = await fetch(getProxyPath('/ai-detect/detect'), {
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
  getServiceStatus: async (): Promise<AIDetectionServiceStatus> => {
    try {
      // 使用代理检查AI检测服务状态
      const aiResponse = await fetch(getProxyPath('/ai-detect/health'))
      const rumorResponse = await fetch(getProxyPath('/rumor/health'))
      const videoResponse = await fetch(getProxyPath('/video-analysis/health'))
      const aiStatus = await aiResponse.json()
      const rumorStatus = await rumorResponse.json()
      const videoStatus = await videoResponse.json()
      
      const videoService = {
        name: '视频分析服务',
        status: videoStatus.status === 'healthy' ? 'healthy' as const : 'unhealthy' as const,
        url: 'http://localhost:8003'
      }
      return {
        services: {
          ai_image_detection: {
            name: 'AI图像检测服务',
            status: aiStatus.status === 'healthy' ? 'healthy' as const : 'unhealthy' as const,
            url: 'http://localhost:8002'
          },
          rumor_detection: {
            name: '图文谣言检测服务',
            status: rumorStatus.status === 'healthy' ? 'healthy' as const : 'unhealthy' as const,
            url: 'http://localhost:8010'
          },
          video_analysis_module1: videoService,
          video_analysis_module2: videoService,
        },
        success_rate: 98.0,
        model_version: 'HCF-v1.0'
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
            name: '视频分析服务',
            status: 'unhealthy',
            url: 'http://localhost:8003'
          },
          video_analysis_module2: {
            name: '视频分析服务',
            status: 'unhealthy',
            url: 'http://localhost:8003'
          }
        },
        completed_detections_24h: 0,
        success_rate: 0,
        model_version: 'HCF-v1.0'
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
    const response = await fetch(getProxyPath('/rumor/detect'), {
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
   * 视频分析单文件上传
   * @param moduleId 模块ID (1 或 2)
   * @param file 视频文件
   * @returns 分析结果
   */
  uploadSingle: async (moduleId: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await fetch(getProxyPath(`/video-analysis/module${moduleId}/upload`), {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || '上传失败')
    }
    
    return await response.json()
  },

  /**
   * 视频分析批量上传
   * @param moduleId 模块ID (1 或 2)  
   * @param file 视频文件
   * @returns 分析结果
   */
  uploadBatch: async (moduleId: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await fetch(getProxyPath(`/video-analysis/module${moduleId}/uploads`), {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || '批量上传失败')
    }
    
    return await response.json()
  },

  /**
   * 获取历史记录
   * @param moduleId 模块ID (1 或 2)
   * @returns 历史记录列表
   */
  getHistory: async (moduleId: number) => {
    const response = await fetch(getProxyPath(`/video-analysis/module${moduleId}/history`))
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || '获取历史记录失败')
    }
    
    return await response.json()
  },

  /**
   * 获取单个历史记录详情
   * @param moduleId 模块ID (123)
   * @param recordId 记录ID
   * @returns 记录详情
   */
  getHistoryDetail: async (moduleId: number, recordId: string) => {
    const response = await fetch(`/video-analysis/module${moduleId}/history/${recordId}`)
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || '获取记录详情失败')
    }
    
    return await response.json()
  },

  /**
   * 删除单个历史记录
   * @param moduleId 模块ID (1 或 2)
   * @param recordId 记录ID
   * @returns 删除结果
   */
  deleteHistory: async (moduleId: number, recordId: string) => {
    const response = await fetch(getProxyPath(`/video-analysis/module${moduleId}/history/${recordId}`), {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || '删除记录失败')
    }
    
    return await response.json()
  },

  /**
   * 删除所有历史记录
   * @param moduleId 模块ID (1 或 2)
   * @returns 删除结果
   */
  deleteAllHistory: async (moduleId: number) => {
    const response = await fetch(getProxyPath(`/video-analysis/module${moduleId}/history`), {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || '删除所有记录失败')
    }
    
    return await response.json()
  },

  /**
   * 获取示例视频URL
   * @param filename 视频文件名
   * @returns 视频URL
   */
  getExampleVideoUrl: (filename: string) => {
    // 使用工具函数处理路径，自动添加 base 前缀
    return getAssetPath(`/static/videos/${filename}`);
  }
}


export const module1API = {
  uploadSingle: (file: File) => videoAPI.uploadSingle(1, file),
  uploadBatch: (file: File) => videoAPI.uploadBatch(1, file),
  getHistory: () => videoAPI.getHistory(1),
  getHistoryDetail: (recordId: string) => videoAPI.getHistoryDetail(1, recordId),
  deleteHistory: (recordId: string) => videoAPI.deleteHistory(1, recordId),
  deleteAllHistory: () => videoAPI.deleteAllHistory(1),
  getExampleVideoUrl: (filename: string) => videoAPI.getExampleVideoUrl(filename)
}

export const module2API = {
  uploadSingle: (file: File) => videoAPI.uploadSingle(2, file),
  uploadBatch: (file: File) => videoAPI.uploadBatch(2, file),
  getHistory: () => videoAPI.getHistory(2),
  getHistoryDetail: (recordId: string) => videoAPI.getHistoryDetail(2, recordId),
  deleteHistory: (recordId: string) => videoAPI.deleteHistory(2, recordId),
  deleteAllHistory: () => videoAPI.deleteAllHistory(2),
  getExampleVideoUrl: (filename: string) => videoAPI.getExampleVideoUrl(filename)
}

export const module3API = {
  getHistory: async () => {
    const response = await fetch(getProxyPath('/video-analysis/module3/history'));
    const data = await response.json();
    // 前端处理路径：将绝对路径转换为纯文件名
    return data.map((item: Record<string, unknown>) => ({
      ...item,
      file_path: typeof item.file_path === 'string' ? item.file_path.split('/').pop() || '' : '' // 提取文件名
    }));
  },
  
  getHistoryDetail: async (id: string) => {
    const response = await fetch(getProxyPath(`/video-analysis/module3/history/${id}`));
    return response.json(); // 详情页不需要处理路径
  },
  deleteHistory: (recordId: string) => videoAPI.deleteHistory(3, recordId),
  deleteAllHistory: () => videoAPI.deleteAllHistory(3),
  getExampleVideoUrl: (filename: string) => videoAPI.getExampleVideoUrl(filename)
  
}
