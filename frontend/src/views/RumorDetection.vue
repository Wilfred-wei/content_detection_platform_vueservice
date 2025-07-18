<template>
  <div class="container-fluid">
    <div class="row d-flex flex-nowrap">
      <!-- 侧边栏 -->
      <Sidebar />
      
      <!-- 主要内容区域 -->
      <main class="content col-10">
        <div class="content-area">
          <h2>图文谣言检测</h2>
          <p class="description">输入文本内容或上传图片，系统将分析并判断是否为谣言信息</p>
          
          <!-- 输入区域 -->
          <div class="input-section">
            <!-- 文本输入 -->
            <div class="text-input-card">
              <h4>文本输入</h4>
              <textarea 
                v-model="textInput"
                class="form-control"
                rows="6"
                placeholder="请输入需要检测的文本内容..."
                @input="clearResults"
              ></textarea>
            </div>
            
            <!-- 图片上传 -->
            <div class="image-upload-card">
              <h4>图片上传</h4>
              <FileUpload 
                :accept="'image/*'"
                :file-type="'image'"
                @file-selected="handleFileSelected"
              />
            </div>
          </div>
          
          <!-- 检测按钮 -->
          <div class="action-section" v-if="hasInput">
            <button 
              class="btn btn-primary btn-lg"
              @click="performDetection"
              :disabled="isLoading"
            >
              <span v-if="isLoading" class="spinner-border spinner-border-sm me-2"></span>
              {{ isLoading ? '检测中...' : '开始检测' }}
            </button>
          </div>
          
          <!-- 检测结果 -->
          <div class="result-section">
            <div class="result-card">
              <h4>检测结果</h4>
              <div class="result-content">
                <!-- 检测中 -->
                <div v-if="isLoading" class="result-placeholder">
                  <div class="loader"></div>
                  <p>正在分析内容，请稍候...</p>
                </div>
                <!-- 检测结果 -->
                <template v-else-if="detectionResult">
                  <div class="result-item">
                    <label>检测状态：</label>
                    <span :class="['status-badge', getStatusClass()]">{{ detectionResult.result }}</span>
                  </div>
                  <div class="result-item">
                    <label>置信度：</label>
                    <span class="confidence">{{ (detectionResult.confidence * 100).toFixed(2) }}%</span>
                  </div>
                  <div class="result-item">
                    <label>检测时间：</label>
                    <span>{{ formatTime(detectionResult.created_at) }}</span>
                  </div>
                </template>
                <!-- 未检测时的占位 -->
                <div v-else class="result-placeholder">
                  <div class="placeholder-icon">📊</div>
                  <div>等待分析结果...</div>
                  <div class="placeholder-hint">输入内容并点击"开始检测"按钮获取分析结果</div>
                </div>
              </div>
            </div>
            <!-- 错误信息 -->
            <div class="alert alert-danger" v-if="errorMessage">
              {{ errorMessage }}
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import Sidebar from '../components/Sidebar.vue'
import FileUpload from '../components/FileUpload.vue'
import { rumorAPI } from '../api'
// 定义谣言检测结果类型
interface RumorDetectionResult {
  is_rumor: boolean
  confidence: number
  result: string
  created_at: string
  reasoning?: string[]
  sources_checked?: string[]
  risk_level?: string
}

const textInput = ref('')
const selectedFile = ref<File | null>(null)
const isLoading = ref(false)
const detectionResult = ref<RumorDetectionResult | null>(null)
const errorMessage = ref('')

const hasInput = computed(() => {
  return textInput.value.trim() !== '' || selectedFile.value !== null
})

const handleFileSelected = (file: File | null) => {
  selectedFile.value = file
  clearResults()
}

const clearResults = () => {
  detectionResult.value = null
  errorMessage.value = ''
}

const performDetection = async () => {
  errorMessage.value = ''
  isLoading.value = true
  
  if (!selectedFile.value) {
    errorMessage.value = '请上传图片，图文结合检测必须上传图片';
    isLoading.value = false;
    return;
  }
  
  try {
    const response = await rumorAPI.analyze({
      text: textInput.value.trim(),
      image: selectedFile.value
    })
    
    console.log('API响应:', response) // 调试日志
    
    if (response.success) {
      // 适配后端返回的数据结构
      detectionResult.value = {
        is_rumor: response.is_rumor,
        confidence: response.confidence,
        result: response.is_rumor ? '谣言' : '非谣言',
        created_at: new Date().toISOString(),
        ...response.result
      }
    } else {
      errorMessage.value = response.message || '检测失败，请重试'
    }
  } catch (error: any) {
    console.error('检测错误:', error) // 调试日志
    errorMessage.value = error.message || '检测服务暂时不可用，请稍后重试'
  } finally {
    isLoading.value = false
  }
}

const getStatusClass = () => {
  if (!detectionResult.value) return ''
  
  const result = detectionResult.value.result.toLowerCase()
  if (result.includes('谣言') || result.includes('false') || result.includes('假')) {
    return 'status-rumor'
  } else if (result.includes('真实') || result.includes('true') || result.includes('正常')) {
    return 'status-normal'
  }
  return 'status-unknown'
}

const formatTime = (timestamp: string) => {
  return new Date(timestamp).toLocaleString('zh-CN')
}
</script>

<style scoped>
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
  max-width: 900px;
  margin: 0 auto;
}

.content-area h2 {
  font-size: 2rem;
  color: #333;
  margin-bottom: 15px;
}

.description {
  color: #666;
  margin-bottom: 30px;
  font-size: 1.1rem;
  line-height: 1.6;
}

.input-section {
  display: grid;
  gap: 30px;
  margin-bottom: 30px;
}

.text-input-card,
.image-upload-card {
  background: white;
  padding: 30px;
  border-radius: 10px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.text-input-card h4,
.image-upload-card h4 {
  color: #333;
  margin-bottom: 20px;
  font-size: 1.3rem;
}

.form-control {
  width: 100%;
  padding: 15px;
  border: 2px solid #e1e5e9;
  border-radius: 8px;
  font-size: 1rem;
  line-height: 1.5;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
  resize: vertical;
  font-family: inherit;
}

.form-control:focus {
  outline: none;
  border-color: #3b87d8;
  box-shadow: 0 0 0 3px rgba(59, 135, 216, 0.1);
}

.action-section {
  text-align: center;
  margin-bottom: 30px;
}

.btn-primary {
  background: #3b87d8;
  border: none;
  padding: 12px 30px;
  font-size: 1.1rem;
  border-radius: 6px;
  transition: all 0.3s ease;
}

.btn-primary:hover:not(:disabled) {
  background: #2c6ac4;
  transform: translateY(-2px);
}

.btn-primary:disabled {
  background: #6c757d;
  cursor: not-allowed;
}

.result-section {
  margin-top: 30px;
}

.result-card {
  background: white;
  padding: 30px;
  border-radius: 10px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.result-card h4 {
  color: #333;
  margin-bottom: 20px;
  font-size: 1.3rem;
}

.result-content {
  display: grid;
  gap: 15px;
}

.result-item {
  display: flex;
  align-items: center;
}

.result-item label {
  font-weight: 500;
  min-width: 100px;
  color: #555;
}

.status-badge {
  padding: 6px 12px;
  border-radius: 20px;
  font-weight: 500;
  font-size: 0.9rem;
}

.status-rumor {
  background: #ffe6e6;
  color: #d63031;
}

.status-normal {
  background: #e6ffe6;
  color: #00b894;
}

.status-unknown {
  background: #fff3cd;
  color: #856404;
}

.confidence {
  font-weight: 600;
  color: #3b87d8;
  font-size: 1.1rem;
}

.alert {
  padding: 15px;
  margin-top: 20px;
  border-radius: 6px;
  border: none;
}

.alert-danger {
  background: #f8d7da;
  color: #721c24;
}

.spinner-border-sm {
  width: 1rem;
  height: 1rem;
}

.result-placeholder {
  text-align: center;
  color: #888;
  padding: 30px 0;
}
.placeholder-icon {
  font-size: 48px;
  margin-bottom: 10px;
}
.placeholder-hint {
  color: #bbb;
  font-size: 0.95rem;
  margin-top: 8px;
}
.loader {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3b87d8;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  animation: spin 1s linear infinite;
  margin: 0 auto 10px auto;
}
@keyframes spin {
  0% { transform: rotate(0deg);}
  100% { transform: rotate(360deg);}
}

/* 适应移动端 */
@media (max-width: 768px) {
  .input-section {
    gap: 20px;
  }
  
  .text-input-card,
  .image-upload-card {
    padding: 20px;
  }
}
</style> 