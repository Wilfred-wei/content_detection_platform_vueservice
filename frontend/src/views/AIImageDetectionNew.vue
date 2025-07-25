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
                        <div v-if="!selectedFile" class="upload-empty">
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

          <!-- 示例图片轮播区域 -->
          <div v-if="currentMode === 'single'" class="example-carousel-section mt-5">
            <div class="row">
              <div class="col-12">
                <h2> <i class="fas fa-images me-2"></i>
                  示例图片库
                </h2>
                <p class="text-center text-muted mb-4">点击任意图片即可快速进行检测</p>
            </div>

            <!-- 真实图像轮播 -->
            <div class="row mb-4">
              <div class="col-12">
                <div class="card border-0 shadow-sm">
                  <div class="card-header bg-success text-white">
                    <h5 class="card-title mb-0">
                      <i class="fas fa-check-circle me-2"></i>
                      真实图像示例
                    </h5>
                  </div>
                  <div class="card-body">
                    <div class="image-carousel">
                      <div 
                        v-for="image in realImages" 
                        :key="image"
                        class="image-card"
                        @click="selectExampleImage('real_img', image)"
                      >
                        <img :src="`/examples/real_img/${image}`" :alt="image" />
                        <div class="image-name">{{ image }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 虚假图像轮播 -->
            <div class="row mb-4">
              <div class="col-12">
                <div class="card border-0 shadow-sm">
                  <div class="card-header bg-warning text-white">
                    <h5 class="card-title mb-0">
                      <i class="fas fa-exclamation-triangle me-2"></i>
                      AI生成图像示例
                    </h5>
                  </div>
                  <div class="card-body">
                    <div class="image-carousel">
                      <div 
                        v-for="image in fakeImages" 
                        :key="image"
                        class="image-card"
                        @click="selectExampleImage('fake_img', image)"
                      >
                        <img :src="`/examples/fake_img/${image}`" :alt="image" />
                        <div class="image-name">{{ image.replace('.png', '').replace('.jpg', '') }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 真实人脸轮播 -->
            <div class="row mb-4">
              <div class="col-12">
                <div class="card border-0 shadow-sm">
                  <div class="card-header bg-info text-white">
                    <h5 class="card-title mb-0">
                      <i class="fas fa-user-check me-2"></i>
                      真实人脸示例
                    </h5>
                  </div>
                  <div class="card-body">
                    <div class="image-carousel">
                      <div 
                        v-for="image in realFaces" 
                        :key="image"
                        class="image-card"
                        @click="selectExampleImage('real_face', image)"
                      >
                        <img :src="`/examples/real_face/${image}`" :alt="image" />
                        <div class="image-name">{{ image }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 虚假人脸轮播 -->
            <div class="row mb-4">
              <div class="col-12">
                <div class="card border-0 shadow-sm">
                  <div class="card-header bg-danger text-white">
                    <h5 class="card-title mb-0">
                      <i class="fas fa-user-times me-2"></i>
                      AI生成人脸示例
                    </h5>
                  </div>
                  <div class="card-body">
                    <div class="image-carousel">
                      <div 
                        v-for="image in fakeFaces" 
                        :key="image"
                        class="image-card"
                        @click="selectExampleImage('fake_face', image)"
                      >
                        <img :src="`/examples/fake_face/${image}`" :alt="image" />
                        <div class="image-name">{{ image }}</div>
                      </div>
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

export default defineComponent({
  name: 'AIImageDetection',
  components: {
    Sidebar,
    BatchDetection
  },
  setup() {
    // 响应式数据
    const currentMode = ref<'single' | 'batch'>('single')
    const selectedFile = ref<File | null>(null)
    const imagePreviewUrl = ref<string>('')
    const uploadProgress = ref<number>(0)
    const isAnalyzing = ref<boolean>(false)
    const isDragOver = ref<boolean>(false)
    const result = ref<any>(null)
    const error = ref<string | null>(null)
    
    // 示例图片数据
    const realImages = ref([
      'H6.jpg', 'J10.jpg', 'J15T.jpg', 'J35A.jpg', 'J35.jpg', 'Y20.png'
    ])
    const fakeImages = ref([
      'a photo of a microwave and a truck.png',
      'a photo of a motorcycle.png',
      'a photo of a parking meter above a broccoli.png',
      'a photo of a parking meter and a teddy bear.png',
      'a photo of a parking meter.png',
      'a photo of a person and an apple.png',
      'a photo of a person and a bear.png',
      'a photo of a person and a sink.png',
      'a photo of a person and a snowboard.png',
      'a photo of a person and a stop sign.png',
      'a photo of a person and a traffic light.png',
      'a photo of a person.png'
    ])
    const realFaces = ref([
      '000324.png', '000326.png', '000329.png', '000330.png', '000339.png', '000340.png',
      '000362.png', '000363.png', '000364.png', '000371.png', '000374.png', '000382.png'
    ])
    const fakeFaces = ref([
      '182638_0.png', '182639_4.png', '182640_11.png', '182642_4.png', '182642_9.png',
      '182644_11.png', '182645_4.png', '182645_7.png', '182646_0.png', '182646_3.png',
      '182649_3.png', '182651_3.png', '182652_7.png', '182652_8.png', '182653_3.png',
      '182653_6.png', '182655_4.png', '182655_5.png', '182655_9.png'
    ])

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
      imagePreviewUrl.value = ''
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
        // 模拟检测过程
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // 模拟结果
        result.value = {
          success: true,
          result: {
            prediction: Math.random() > 0.5 ? 'fake' : 'real',
            confidence: Math.random() * 0.4 + 0.6,
            processing_time: 2.1
          }
        }
      } catch (err: any) {
        console.error('AI检测失败:', err)
        result.value = {
          success: false,
          error: err.message || '检测过程中发生错误，请重试'
        }
      } finally {
        isAnalyzing.value = false
      }
    }

    const resetDetection = () => {
      result.value = null
      error.value = null
    }

    // 选择示例图片方法
    const selectExampleImage = async (category: string, imageName: string) => {
      try {
        const imagePath = `/examples/${category}/${imageName}`
        const response = await fetch(imagePath)
        
        if (!response.ok) {
          throw new Error('无法加载示例图片')
        }
        
        const blob = await response.blob()
        const file = new File([blob], imageName, { type: blob.type })
        
        // 使用现有的选择文件方法
        selectFile(file)
        
        // 清除之前的检测结果
        result.value = null
        error.value = null
        
        console.log(`已选择示例图片: ${imageName}`)
      } catch (err: any) {
        console.error('选择示例图片失败:', err)
        error.value = `加载示例图片失败: ${err.message}`
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
      realImages,
      fakeImages,
      realFaces,
      fakeFaces,
      
      // 计算属性
      resultAlertClass,
      resultIconClass,
      
      // 方法
      handleFileSelect,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      clearFile,
      startAnalysis,
      resetDetection,
      formatFileSize,
      getDisplayPrediction,
      onBatchJobCreated,
      selectExampleImage
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

.content-area {
  padding: 40px;
  width: 100%;
  height: 100%;
  background: white;
  border-radius: 10px;
  margin: 20px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
  overflow-y: auto;
}

.content-area h2 {
  color: #0056b3;
  margin-bottom: 20px;
  font-size: 2em;
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 10px;
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

.preview-img {
  max-width: 200px;
  max-height: 200px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
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
</style>

<style>
/* 简洁的图片轮播样式 */
.example-carousel-section {
  margin-top: 3rem;
}

.image-carousel {
  display: flex;
  gap: 1rem;
  overflow-x: auto;
  padding: 1rem 0;
  scroll-behavior: smooth;
}

.image-carousel::-webkit-scrollbar {
  height: 8px;
}

.image-carousel::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.image-carousel::-webkit-scrollbar-thumb {
  background: #007bff;
  border-radius: 4px;
}

.image-card {
  flex: 0 0 200px;
  cursor: pointer;
  transition: transform 0.2s ease;
  text-align: center;
  padding: 1rem;
  border-radius: 8px;
  background: #f8f9fa;
  border: 2px solid transparent;
}

.image-card:hover {
  transform: translateY(-4px);
  border-color: #007bff;
  box-shadow: 0 4px 12px rgba(0, 123, 255, 0.15);
}

.image-card img {
  width: 100%;
  height: 120px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid #dee2e6;
}

.image-name {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: #6c757d;
  word-break: break-all;
}
</style> 