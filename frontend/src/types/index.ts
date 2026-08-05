// === 通用API响应类型 ===

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: string
  details?: any
}

// === AI图像检测相关类型 ===

export interface AIImageDetectionRequest {
  image: File
}

export interface AIImageDetectionResult {
  success: boolean
  detection_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  message: string
  error?: string
  result?: {
    prediction: 'real' | 'ai_generated'
    prediction_text: string
    confidence: number
    confidence_percentage: number
    ai_probability: number
    model_version: string
    processing_time: number
    image_info: {
      width: number
      height: number
      format: string
      file_size: number
    }
  }
}

export interface AIImageDetectionRecord {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  prediction: 'real' | 'ai_generated' | null
  confidence: number | null
  confidence_percentage: number | null
  ai_probability: number | null
  result_text: string
  model_version: string
  processing_time: number | null
  file_size: number | null
  image_width: number | null
  image_height: number | null
  image_format: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  error_message: string
  image_url: string | null
}

export interface ServiceInfo {
  name: string
  status: 'healthy' | 'unhealthy'
  url: string
}

export interface AIDetectionServiceStatus {
  services: {
    ai_image_detection: ServiceInfo
    rumor_detection: ServiceInfo
    video_analysis_module1: ServiceInfo
    video_analysis_module2: ServiceInfo

  }
  // 添加可选的统计字段
  completed_detections_24h?: number
  success_rate?: number
  model_version?: string
}

// === 谣言检测相关类型 ===

export interface RumorDetectionRequest {
  text: string
  include_image?: boolean
}

export interface RumorDetectionResult {
  detection_id: string
  detection_type: 'rumor'
  status: 'pending' | 'completed' | 'failed'
  result: {
    is_rumor: boolean
    probability: number
    reasons: string[]
  }
  confidence: number
  created_at: string
  completed_at: string
}

// === 视频分析相关类型 ===

export interface VideoAnalysisRequest {
  video: File
}

export interface VideoAnalysisResult {
  detection_id: string
  detection_type: string
  status: 'pending' | 'completed' | 'failed'
  result: {
    analysis_type: string
    summary: string
    metrics: {
      duration: string
      quality_score: number
      content_tags: string[]
    }
  }
  confidence: number
  created_at: string
  completed_at: string
}

// === 系统状态相关类型 ===

export interface ModuleStatus {
  module_name: string
  status: 'online' | 'offline' | 'maintenance'
  last_updated: string
  version: string
}

export interface SystemStatus {
  success: boolean
  data: ModuleStatus[]
}

// === 文件上传相关类型 ===

export interface FileUploadProgress {
  loaded: number
  total: number
  percentage: number
}

export interface FileValidationError {
  field: string
  message: string
}

// === UI状态相关类型 ===

export type LoadingState = 'idle' | 'loading' | 'success' | 'error'

export interface UIState {
  loading: LoadingState
  error: string | null
  message: string | null
}

// === 组件Props类型 ===

export interface FileUploadProps {
  accept?: string
  maxSize?: number
  multiple?: boolean
  onFileSelect?: (files: File[]) => void
  onError?: (error: string) => void
}

export interface DetectionResultProps {
  result: AIImageDetectionResult | RumorDetectionResult | VideoAnalysisResult
  showDetails?: boolean
}

export interface SidebarProps {
  collapsed?: boolean
  onToggle?: () => void
}

// === 表单数据类型 ===

export interface AIImageFormData {
  selectedFile: File | null
  uploadProgress: number
  isAnalyzing: boolean
  result: AIImageDetectionResult | null
  error: string | null
}

export interface RumorFormData {
  text: string
  includeImage: boolean
  selectedImage: File | null
  isAnalyzing: boolean
  result: RumorDetectionResult | null
  error: string | null
}

export interface VideoFormData {
  selectedFile: File | null
  moduleId: number
  uploadProgress: number
  isAnalyzing: boolean
  result: VideoAnalysisResult | null
  error: string | null
}

// === 历史记录类型 (如果需要的话) ===

export interface DetectionHistoryItem {
  id: string
  type: 'ai_image' | 'rumor' | 'video_analysis'
  fileName?: string
  result: string
  confidence: number
  timestamp: string
}

// === 统计数据类型 ===

export interface DetectionStatistics {
  total_detections: number
  ai_generated_count: number
  real_image_count: number
  success_rate: number
  avg_confidence: number
  avg_processing_time: number
}

// === 错误处理类型 ===

export interface APIError {
  status: number
  message: string
  details?: any
  timestamp: string
}

export interface ValidationError {
  field: string
  code: string
  message: string
}

// === 旧版本兼容类型 (保持向后兼容) ===

export interface DetectionRequest {
  text?: string
  image?: File
  video?: File
  detection_type: string
}

export interface DetectionResult {
  detection_id: string
  detection_type: string
  status: string
  result: any
  confidence: number
  created_at: string
  completed_at?: string
} 