<template>
  <div class="container-fluid">
    <div class="row d-flex flex-nowrap">
      <!-- 侧边栏 -->
      <Sidebar />
      
      <!-- 主要内容区域 -->
      <main class="content col-10">
        <div class="content-area">
          <h2>视频分析 - 子模块一</h2>
          <p class="description">上传视频文件，系统将进行专业的视频分析处理</p>
          
          <!-- 文件上传区域 -->
          <div class="upload-section">
            <FileUpload 
              :accept="'video/*'"
              :file-type="'video'"
              @file-selected="handleFileSelected"
            />
          </div>
          
          <!-- 检测按钮 -->
          <div class="action-section" v-if="selectedFile">
            <button 
              class="btn btn-primary btn-lg"
              @click="performAnalysis"
              :disabled="isLoading"
            >
              <span v-if="isLoading" class="spinner-border spinner-border-sm me-2"></span>
              {{ isLoading ? '分析中...' : '开始分析' }}
            </button>
          </div>
          
          <!-- 分析结果 -->
          <div class="result-section" v-if="analysisResult">
            <div class="result-card">
              <h4>分析结果</h4>
              <div class="result-content">
                <div class="result-item">
                  <label>分析状态：</label>
                  <span class="status-badge status-success">{{ analysisResult.result }}</span>
                </div>
                <div class="result-item">
                  <label>置信度：</label>
                  <span class="confidence">{{ (analysisResult.confidence * 100).toFixed(2) }}%</span>
                </div>
                <div class="result-item">
                  <label>分析时间：</label>
                  <span>{{ formatTime(analysisResult.timestamp) }}</span>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 错误信息 -->
          <div class="alert alert-danger" v-if="errorMessage">
            {{ errorMessage }}
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Sidebar from '../components/Sidebar.vue'
import FileUpload from '../components/FileUpload.vue'
import { videoAPI } from '../api'
import type { DetectionResult } from '../types'

const selectedFile = ref<File | null>(null)
const isLoading = ref(false)
const analysisResult = ref<DetectionResult | null>(null)
const errorMessage = ref('')

const handleFileSelected = (file: File | null) => {
  selectedFile.value = file
  analysisResult.value = null
  errorMessage.value = ''
}

const performAnalysis = async () => {
  if (!selectedFile.value) return
  
  isLoading.value = true
  errorMessage.value = ''
  
  try {
    const response = await videoAPI.analyzeVideo(1, {
      video: selectedFile.value
    })
    
    if (response.success && response.data) {
      analysisResult.value = response.data
    } else {
      errorMessage.value = response.message || '分析失败，请重试'
    }
  } catch (error) {
    console.error('视频分析错误:', error)
    errorMessage.value = '分析服务暂时不可用，请稍后重试'
  } finally {
    isLoading.value = false
  }
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
  max-width: 800px;
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

.upload-section {
  background: white;
  padding: 30px;
  border-radius: 10px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  margin-bottom: 30px;
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

.status-success {
  background: #e6ffe6;
  color: #00b894;
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
</style> 