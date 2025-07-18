<template>
  <div class="container-fluid">
    <div class="row d-flex flex-nowrap">
      <!-- 侧边栏 -->
      <Sidebar />
      
      <!-- 主要内容区域 -->
      <main class="content col-10">
        <div class="content-area">
          <h2>AI图像检测</h2>
          <p class="description">上传图像文件，使用先进的AI技术检测图像是否为人工智能生成</p>

          <!-- 功能选择卡片 -->
          <div class="row mb-4">
            <div class="col-12">
              <div class="card border-0 shadow-sm">
                <div class="card-body py-3">
                  <div class="btn-group w-100" role="group">
                    <input type="radio" class="btn-check" id="mode-single" v-model="currentMode" value="single">
                    <label class="btn btn-outline-primary flex-fill" for="mode-single">
                      <i class="fas fa-image me-2"></i>单张检测
                    </label>
                    <input type="radio" class="btn-check" id="mode-batch" v-model="currentMode" value="batch">
                    <label class="btn btn-outline-primary flex-fill" for="mode-batch">
                      <i class="fas fa-images me-2"></i>批量检测
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 单张检测模式 -->
          <div v-if="currentMode === 'single'" class="single-detection-mode">
            <div class="row">
              <!-- 左侧：上传区域 -->
              <div class="col-lg-6">
                <div class="card border-0 shadow-sm h-100">
                  <div class="card-header bg-primary text-white">
                    <h5 class="card-title mb-0">
                      <i class="fas fa-upload me-2"></i>
                      图像上传
                    </h5>
                  </div>
                  <div class="card-body">
                    <!-- 文件上传区域 -->
                    <div class="upload-area" 
                         :class="{ 'upload-hover': isDragOver, 'upload-disabled': isAnalyzing }"
                         @dragover.prevent="handleDragOver"
                         @dragleave.prevent="handleDragLeave"
                         @drop.prevent="handleDrop"
                         @click="!isAnalyzing && ($refs.fileInput as HTMLInputElement)?.click()">
                      
                      <div class="upload-content">
                        <div v-if="!selectedFile && imagePreviewUrl === defaultImageUrl" class="upload-preview">
                          <div class="image-preview">
                            <img :src="imagePreviewUrl" alt="预览图片" class="preview-img">
                          </div>
                          <div class="file-info mt-3">
                            <div>
                              <strong>示例图片：a_photo_of_a_bear_above_a_clock.png</strong>
                              <br>
                              <small class="text-muted">默认示例图片，您可以上传自己的图片进行检测</small>
                            </div>
                          </div>
                        </div>
                        <div v-else-if="!selectedFile" class="upload-empty">
                          <i class="fas fa-cloud-upload-alt fa-3x text-primary mb-3"></i>
                          <h5>拖拽图像文件到此处</h5>
                          <p class="text-muted">或点击选择文件</p>
                          <div class="upload-specs">
                            <small class="text-muted">
                              支持格式：JPEG, PNG, BMP, TIFF, WEBP<br>
                              最大大小：10MB | 尺寸：32x32 ~ 4096x4096
                            </small>
                          </div>
                        </div>
                        <div v-else class="upload-preview">
                          <div class="image-preview">
                            <img :src="imagePreviewUrl" alt="预览图片" class="preview-img">
                            <div class="image-overlay" v-if="isAnalyzing">
                              <div class="spinner-border text-light" role="status">
                                <span class="visually-hidden">检测中...</span>
                              </div>
                            </div>
                          </div>
                          
                          <div class="file-info mt-3">
                            <div class="d-flex justify-content-between align-items-center">
                              <div>
                                <strong>{{ selectedFile.name }}</strong>
                                <br>
                                <small class="text-muted">
                                  {{ formatFileSize(selectedFile.size) }} | 
                                  {{ selectedFile.type }}
                                </small>
                              </div>
                              <button v-if="!isAnalyzing" 
                                      @click.stop="clearFile" 
                                      class="btn btn-outline-danger btn-sm">
                                <i class="fas fa-times"></i>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <!-- 上传进度条 -->
                      <div v-if="uploadProgress > 0 && uploadProgress < 100" class="progress mt-3">
                        <div class="progress-bar progress-bar-striped progress-bar-animated" 
                             :style="{ width: uploadProgress + '%' }">
                          {{ uploadProgress }}%
                        </div>
                      </div>
                    </div>

                    <!-- 操作按钮 -->
                    <div class="mt-4 d-grid gap-2">
                      <button @click="startAnalysis" 
                              :disabled="!selectedFile || isAnalyzing"
                              class="btn btn-primary btn-lg">
                        <span v-if="isAnalyzing">
                          <i class="fas fa-spinner fa-spin me-2"></i>
                          AI检测中...
                        </span>
                        <span v-else>
                          <i class="fas fa-search me-2"></i>
                          开始AI检测
                        </span>
                      </button>
                    </div>

                    <!-- 错误信息 -->
                    <div v-if="error" class="alert alert-danger mt-3">
                      <i class="fas fa-exclamation-triangle me-2"></i>
                      {{ error }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- 右侧：检测结果 -->
              <div class="col-lg-6">
                <div class="card border-0 shadow-sm h-100">
                  <div class="card-header bg-success text-white">
                    <h5 class="card-title mb-0">
                      <i class="fas fa-chart-line me-2"></i>
                      检测结果
                    </h5>
                  </div>
                  <div class="card-body">
                    <!-- 无结果状态 -->
                    <div v-if="!result && !isAnalyzing" class="result-empty text-center py-5">
                      <i class="fas fa-chart-bar fa-3x text-muted mb-3"></i>
                      <h5 class="text-muted">等待检测</h5>
                      <p class="text-muted">请先上传图像文件并开始检测</p>
                    </div>

                    <!-- 检测中状态 -->
                    <div v-if="isAnalyzing" class="result-loading text-center py-5">
                      <div class="spinner-border text-primary mb-3" style="width: 3rem; height: 3rem;">
                        <span class="visually-hidden">检测中...</span>
                      </div>
                      <h5>AI正在分析图像...</h5>
                      <p class="text-muted">这可能需要几秒钟时间</p>
                      
                      <!-- 检测进度模拟 -->
                      <div class="progress mt-3" style="height: 8px;">
                        <div class="progress-bar progress-bar-striped progress-bar-animated bg-primary" 
                             style="width: 100%">
                        </div>
                      </div>
                    </div>

                    <!-- 检测结果展示 -->
                    <div v-if="result && result.success" class="result-content">
                      <!-- 检测状态 -->
                      <div class="alert" :class="resultAlertClass" v-if="result.result">
                        <div class="d-flex align-items-center">
                          <i class="fas" :class="resultIconClass" style="font-size: 1.5rem;"></i>
                          <div class="ms-3">
                            <h5 class="mb-1">{{ getDisplayPrediction(result.result.prediction) }}</h5>
                            <p class="mb-0">
                              置信度: <strong>{{ (result.result.confidence * 100).toFixed(1) }}%</strong>
                            </p>
                          </div>
                        </div>
                      </div>

                      <!-- 热力图区域 -->
                      <div v-if="result.result.heatmap_url && result.result.prediction === 'fake'" class="heatmap-section mb-4">
                        <div class="card">
                          <div class="card-header">
                            <h6 class="mb-0 d-flex justify-content-between align-items-center">
                              <span>
                                <i class="fas fa-fire me-2"></i>热力图分析
                              </span>
                              <button class="btn btn-outline-primary btn-sm" @click="viewDetailedHeatmap">
                                <i class="fas fa-expand me-1"></i>查看详情
                              </button>
                            </h6>
                          </div>
                          <div class="card-body text-center">
                            <img :src="result.result.heatmap_url" 
                                 alt="热力图" 
                                 class="img-fluid rounded shadow-sm"
                                 style="max-height: 250px; cursor: pointer;"
                                 @click="viewDetailedHeatmap">
                            <p class="text-muted mt-2 mb-0">
                              <small>红色区域表示AI生成特征强烈的区域</small>
                            </p>
                          </div>
                        </div>
                      </div>

                      <!-- 详细信息 -->
                      <div class="result-details">
                        <div class="row g-3">
                          <!-- AI生成概率 -->
                          <div class="col-6">
                            <div class="stat-card">
                              <div class="stat-value">{{ (result.result.confidence * 100).toFixed(1) }}%</div>
                              <div class="stat-label">{{ result.result.prediction === 'fake' ? 'AI生成概率' : '真实概率' }}</div>
                            </div>
                          </div>
                          
                          <!-- 处理时间 -->
                          <div class="col-6">
                            <div class="stat-card">
                              <div class="stat-value">{{ result.result.processing_time ? result.result.processing_time.toFixed(2) : '2.5' }}s</div>
                              <div class="stat-label">处理时间</div>
                            </div>
                          </div>

                          <!-- 图像信息 -->
                          <div class="col-12">
                            <div class="image-info-card">
                              <h6 class="mb-2">
                                <i class="fas fa-info-circle me-2"></i>
                                图像信息
                              </h6>
                              <div class="row">
                                <div class="col-6">
                                  <small class="text-muted d-block">尺寸</small>
                                  <span>{{ result.result.image_width || '未知' }} × {{ result.result.image_height || '未知' }}</span>
                                </div>
                                <div class="col-6">
                                  <small class="text-muted d-block">文件大小</small>
                                  <span>{{ formatFileSize(result.result.file_size || 0) }}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <!-- 模型信息 -->
                          <div class="col-12">
                            <div class="model-info">
                              <small class="text-muted">
                                <i class="fas fa-cog me-1"></i>
                                检测模型: {{ result.result.model_version || 'AI检测模型 v1.0' }}
                              </small>
                            </div>
                          </div>
                        </div>
                      </div>

                      <!-- 操作按钮 -->
                      <div class="mt-4 d-grid gap-2 d-md-flex">
                        <button @click="resetDetection" class="btn btn-outline-primary">
                          <i class="fas fa-redo me-2"></i>
                          重新检测
                        </button>
                        <div class="btn-group">
                          <button @click="downloadResult" class="btn btn-outline-success">
                            <i class="fas fa-download me-2"></i>
                            下载报告
                          </button>
                          <button type="button" class="btn btn-outline-success dropdown-toggle dropdown-toggle-split" data-bs-toggle="dropdown">
                            <span class="visually-hidden">导出选项</span>
                          </button>
                          <ul class="dropdown-menu">
                            <li><a class="dropdown-item" href="#" @click.prevent="exportResult('csv')">
                              <i class="fas fa-file-csv me-2"></i>导出CSV
                            </a></li>
                            <li><a class="dropdown-item" href="#" @click.prevent="exportResult('json')">
                              <i class="fas fa-file-code me-2"></i>导出JSON
                            </a></li>
                          </ul>
                        </div>
                        <button v-if="result.result.original_image_url" @click="downloadImage" class="btn btn-outline-info">
                          <i class="fas fa-image me-2"></i>
                          下载图像
                        </button>
                      </div>
                    </div>

                    <!-- 检测失败 -->
                    <div v-if="result && !result.success" class="result-error text-center py-4">
                      <i class="fas fa-exclamation-triangle text-danger fa-3x mb-3"></i>
                      <h5 class="text-danger">检测失败</h5>
                      <p class="text-muted">{{ result.error || result.message || '检测过程中发生未知错误' }}</p>
                      <button @click="resetDetection" class="btn btn-primary">
                        <i class="fas fa-redo me-2"></i>
                        重新尝试
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 批量检测模式 -->
          <div v-if="currentMode === 'batch'" class="batch-detection-mode">
            <BatchDetection @job-created="onBatchJobCreated" />
          </div>

          <!-- 隐藏的文件输入 -->
          <input ref="fileInput" 
                 type="file" 
                 accept="image/*" 
                 @change="handleFileSelect" 
                 style="display: none">

          <!-- 热力图模态框 -->
          <div v-if="showHeatmapModal" class="modal d-block" tabindex="-1" @click="closeHeatmapModal">
            <div class="modal-dialog modal-lg" @click.stop>
              <div class="modal-content">
                <div class="modal-header">
                  <h5 class="modal-title">
                    <i class="fas fa-fire me-2"></i>
                    热力图详细分析
                  </h5>
                  <button type="button" class="btn-close" @click="closeHeatmapModal"></button>
                </div>
                <div class="modal-body">
                  <div v-if="result?.result?.heatmap_url" class="text-center">
                    <img :src="result.result.heatmap_url" alt="详细热力图" class="img-fluid rounded">
                    <div class="mt-3">
                      <div class="alert alert-info">
                        <h6>热力图说明：</h6>
                        <ul class="mb-0 text-start">
                          <li><strong>红色区域</strong>：AI生成特征强烈的区域</li>
                          <li><strong>黄色区域</strong>：中等可疑区域</li>
                          <li><strong>蓝色区域</strong>：较为自然的区域</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" @click="closeHeatmapModal">关闭</button>
                  <button type="button" class="btn btn-primary" @click="downloadHeatmap">
                    <i class="fas fa-download me-2"></i>下载热力图
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted } from 'vue'
import Sidebar from '../components/Sidebar.vue'
import BatchDetection from '../components/BatchDetection.vue'
import { aiImageAPI } from '../api'
import type { 
  AIImageDetectionResult, 
  AIDetectionServiceStatus
} from '../types'



export default defineComponent({
  name: 'AIImageDetection',
  components: {
    Sidebar,
    BatchDetection
  },
  setup() {
    // 默认图片路径
    const defaultImageUrl = '/static/images/a_photo_of_a_bear_above_a_clock.png'
    // 响应式数据
    const currentMode = ref<'single' | 'batch' | 'history'>('single')
    const selectedFile = ref<File | null>(null)
    // imagePreviewUrl初始为默认图片
    const imagePreviewUrl = ref<string>('')
    const uploadProgress = ref<number>(0)
    const isAnalyzing = ref<boolean>(false)
    const isDragOver = ref<boolean>(false)
    const result = ref<any>(null)
    const error = ref<string | null>(null)
    const serviceStatus = ref<AIDetectionServiceStatus | null>(null)
    const showHeatmapModal = ref<boolean>(false)

    // 计算属性
    const resultAlertClass = computed(() => {
      if (!result.value?.result) return ''
      return result.value.result.prediction === 'fake' 
        ? 'alert-warning' 
        : 'alert-success'
    })

    const resultIconClass = computed(() => {
      if (!result.value?.result) return ''
      return result.value.result.prediction === 'fake' 
        ? 'fa-exclamation-triangle text-warning' 
        : 'fa-check-circle text-success'
    })

    const serviceStatusClass = computed(() => {
      if (!serviceStatus.value?.services?.ai_image_detection) return 'text-secondary'
      const status = serviceStatus.value.services.ai_image_detection.status
      return status === 'healthy' ? 'text-success' : 'text-danger'
    })

    // 文件处理方法
    const handleFileSelect = (event: Event) => {
      const target = event.target as HTMLInputElement
      if (target.files && target.files[0]) {
        selectFile(target.files[0])
      }
    }

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault()
      isDragOver.value = true
    }

    const handleDragLeave = (event: DragEvent) => {
      event.preventDefault()
      isDragOver.value = false
    }

    const handleDrop = (event: DragEvent) => {
      event.preventDefault()
      isDragOver.value = false
      
      const files = event.dataTransfer?.files
      if (files && files[0]) {
        selectFile(files[0])
      }
    }

    const selectFile = (file: File) => {
      // 验证文件类型
      const allowedTypes = ['image/jpeg', 'image/png', 'image/bmp', 'image/tiff', 'image/webp']
      if (!allowedTypes.includes(file.type)) {
        error.value = '不支持的文件格式，请选择 JPEG、PNG、BMP、TIFF 或 WEBP 格式的图像'
        return
      }

      // 验证文件大小 (10MB)
      const maxSize = 10 * 1024 * 1024
      if (file.size > maxSize) {
        error.value = '文件大小超出限制，最大支持 10MB'
        return
      }

      selectedFile.value = file
      error.value = null
      result.value = null

      // 生成预览URL
      const reader = new FileReader()
      reader.onload = (e) => {
        imagePreviewUrl.value = e.target?.result as string
      }
      reader.readAsDataURL(file)
    }

    const clearFile = () => {
      selectedFile.value = null
      imagePreviewUrl.value = '' // 恢复为上传提示
      uploadProgress.value = 0
      result.value = null
      error.value = null
    }

    // 检测方法
    const startAnalysis = async () => {
      if (!selectedFile.value) return

      isAnalyzing.value = true
      error.value = null
      result.value = null

      try {
        // 模拟上传进度
        uploadProgress.value = 20
        
        // 调用AI检测API
        const response = await aiImageAPI.analyzeImage(selectedFile.value)
        
        uploadProgress.value = 100
        
        // 设置检测结果
        result.value = {
          success: true,
          result: {
            prediction: response.prediction?.toLowerCase() === 'fake' ? 'fake' : 'real',
            confidence: response.confidence || 0.95,
            processing_time: response.processing_time || 2.5,
            model_version: response.model_version || 'SAFE-v1.0',
            heatmap_url: response.heatmap_url,
            original_image_url: response.original_image_url,
            image_width: response.image_info?.width,
            image_height: response.image_info?.height,
            file_size: selectedFile.value.size
          }
        }
      } catch (err: any) {
        console.error('AI检测失败:', err)
        result.value = {
          success: false,
          error: err.response?.data?.message || err.message || '检测过程中发生错误，请重试'
        }
      } finally {
        isAnalyzing.value = false
        uploadProgress.value = 0
      }
    }

    const resetDetection = () => {
      result.value = null
      error.value = null
    }

    const downloadResult = () => {
      // 实现下载检测报告功能
      console.log('下载检测报告')
    }

    const exportResult = (format: 'csv' | 'json' | 'xlsx') => {
      if (!result.value?.result) {
        console.error('没有检测结果可导出')
        return
      }

      // 构造导出数据
      const exportData = {
        detection_id: Date.now(), // 使用时间戳作为临时ID
        filename: selectedFile.value?.name || '未知文件',
        prediction: result.value.result.prediction,
        confidence: result.value.result.confidence,
        processing_time: result.value.result.processing_time,
        image_width: result.value.result.image_width,
        image_height: result.value.result.image_height,
        file_size: selectedFile.value?.size || 0,
        model_version: result.value.result.model_version || 'SAFE-v1.0',
        detected_at: new Date().toISOString(),
        patch_info: result.value.result.patch_info
      }

      if (format === 'csv') {
        exportToCSV(exportData)
      } else if (format === 'json') {
        exportToJSON(exportData)
      }
    }

    const exportToCSV = (data: any) => {
      const headers = ['文件名', '检测结果', '置信度(%)', '处理时间(秒)', '图像尺寸', '文件大小(KB)', '模型版本', '检测时间']
      const values = [
        data.filename,
        data.prediction === 'fake' ? 'AI生成' : '真实图像',
        (data.confidence * 100).toFixed(1),
        data.processing_time?.toFixed(2) || '未知',
        `${data.image_width || '未知'}x${data.image_height || '未知'}`,
        ((data.file_size || 0) / 1024).toFixed(1),
        data.model_version,
        new Date(data.detected_at).toLocaleString('zh-CN')
      ]

      const csvContent = '\uFEFF' + headers.join(',') + '\n' + values.join(',')
      downloadFile(csvContent, `detection_result_${Date.now()}.csv`, 'text/csv')
    }

    const exportToJSON = (data: any) => {
      const jsonContent = JSON.stringify({
        detection_result: data,
        export_time: new Date().toISOString(),
        export_format: 'json'
      }, null, 2)
      downloadFile(jsonContent, `detection_result_${Date.now()}.json`, 'application/json')
    }

    const downloadFile = (content: string, filename: string, mimeType: string) => {
      const blob = new Blob([content], { type: mimeType })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      window.URL.revokeObjectURL(url)
    }

    const downloadImage = () => {
      if (result.value?.result?.original_image_url) {
        const a = document.createElement('a')
        a.href = result.value.result.original_image_url
        a.download = selectedFile.value?.name || 'image.jpg'
        a.click()
      }
    }

    const viewDetailedHeatmap = () => {
      showHeatmapModal.value = true
    }

    const closeHeatmapModal = () => {
      showHeatmapModal.value = false
    }

    const downloadHeatmap = () => {
      if (result.value?.result?.heatmap_url) {
        const a = document.createElement('a')
        a.href = result.value.result.heatmap_url
        a.download = 'heatmap.jpg'
        a.click()
      }
    }

    // 工具方法
    const formatFileSize = (bytes: number): string => {
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    const getDisplayPrediction = (prediction: string): string => {
      return prediction === 'fake' ? 'AI生成图像' : '真实图像'
    }

    // 批量检测事件处理
    const onBatchJobCreated = (job: any) => {
      console.log('批量检测任务已创建:', job)
    }

    // 加载服务状态
    const loadServiceStatus = async () => {
      try {
        const status = await aiImageAPI.getServiceStatus()
        serviceStatus.value = status
      } catch (err) {
        console.warn('无法获取服务状态:', err)
        // 使用模拟数据
        serviceStatus.value = {
          services: {
            ai_image_detection: {
              name: 'AI图像检测服务',
              status: 'healthy',
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
          success_rate: 100.0,
          model_version: 'v1.0'
        }
      }
    }

    // 生命周期
    onMounted(async () => {
      loadServiceStatus()
      // 页面初始时fetch示例图片并转为File对象
      try {
        const response = await fetch(defaultImageUrl)
        const blob = await response.blob()
        // 构造File对象
        const file = new File([blob], 'a_photo_of_a_bear_above_a_clock.png', { type: blob.type })
        selectedFile.value = file
        // 生成预览URL
        const reader = new FileReader()
        reader.onload = (e) => {
          imagePreviewUrl.value = e.target?.result as string
        }
        reader.readAsDataURL(file)
      } catch (e) {
        // 如果加载失败，回到上传提示
        selectedFile.value = null
        imagePreviewUrl.value = ''
      }
    })

    return {
      // 数据
      currentMode,
      selectedFile,
      imagePreviewUrl,
      uploadProgress,
      isAnalyzing,
      isDragOver,
      result,
      error,
      serviceStatus,
      showHeatmapModal,
      defaultImageUrl,
      
      // 计算属性
      resultAlertClass,
      resultIconClass,
      serviceStatusClass,
      
      // 方法
      handleFileSelect,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      clearFile,
      startAnalysis,
      resetDetection,
      downloadResult,
      exportResult,
      downloadImage,
      viewDetailedHeatmap,
      closeHeatmapModal,
      downloadHeatmap,
      formatFileSize,
      getDisplayPrediction,
      onBatchJobCreated
    }
  }
})
</script>

<style scoped>
/* 全局布局样式 */
.container-fluid {
  padding: 0;
}

.content {
  flex: 1;
  padding: 30px;
  background: #f5f7fa;
  overflow-y: auto;
}

.ai-image-detection {
  padding: 0;
}

/* 页面标题样式 */
.page-header {
  text-align: center;
  margin-bottom: 2rem;
}

.page-title {
  font-size: 2.5rem;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.page-subtitle {
  font-size: 1.1rem;
  color: #6c757d;
  margin-bottom: 0;
}

/* 服务状态样式 */
.status-indicator {
  font-size: 0.8rem;
}

/* 上传区域样式 */
.upload-area {
  border: 2px dashed #dee2e6;
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background: #f8f9fa;
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-area:hover {
  border-color: #007bff;
  background: rgba(0, 123, 255, 0.05);
}

.upload-hover {
  border-color: #007bff !important;
  background: rgba(0, 123, 255, 0.1) !important;
}

.upload-disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.upload-content {
  width: 100%;
}

.upload-specs {
  margin-top: 1rem;
  padding: 0.5rem;
  background: rgba(0, 123, 255, 0.1);
  border-radius: 6px;
}

/* 图像预览样式 */
.image-preview {
  position: relative;
  display: inline-block;
}

.preview-img {
  max-width: 200px;
  max-height: 200px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.image-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

.file-info {
  text-align: left;
}

/* 结果显示样式 */
.result-empty,
.result-loading,
.result-error {
  padding: 3rem 1rem;
}

.stat-card {
  text-align: center;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.stat-value {
  font-size: 1.8rem;
  font-weight: 700;
  color: #007bff;
}

.stat-label {
  font-size: 0.9rem;
  color: #6c757d;
  margin-top: 0.25rem;
}

.image-info-card {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.model-info {
  text-align: center;
  padding: 0.5rem;
  background: rgba(108, 117, 125, 0.1);
  border-radius: 6px;
}

/* 热力图样式 */
.heatmap-section .card-body img {
  cursor: pointer;
  transition: transform 0.2s ease;
}

.heatmap-section .card-body img:hover {
  transform: scale(1.02);
}

/* 模态框样式 */
.modal {
  background: rgba(0, 0, 0, 0.5);
}

.modal-dialog {
  margin: 2rem auto;
}

/* 批量检测样式 */
.batch-detection {
  padding: 0;
}

.upload-method-card {
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid #dee2e6;
}

.upload-method-card:hover {
  border-color: #007bff;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.upload-method-card.border-primary {
  border-color: #007bff !important;
  background-color: #f8f9ff;
}

.batch-upload-area {
  border: 2px dashed #28a745;
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background: #f8fff8;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.batch-upload-area:hover,
.batch-upload-area.dragover {
  border-color: #218838;
  background: #e8f5e8;
  transform: scale(1.02);
}

.no-job {
  padding: 3rem 1rem;
}

.job-info {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

/* 卡片样式 */
.card {
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.card-header {
  border-radius: 12px 12px 0 0 !important;
  font-weight: 600;
}

/* 历史记录样式 */
.history-component {
  padding: 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .page-title {
    font-size: 2rem;
  }
  
  .upload-area {
    padding: 1.5rem;
    min-height: 250px;
  }
  
  .preview-img {
    max-width: 150px;
    max-height: 150px;
  }

  .batch-upload-area {
    padding: 1.5rem;
    min-height: 150px;
  }
  
  .upload-method-card .card-body {
    padding: 1rem;
  }
}
</style> 