<template>
  <div class="file-upload">
    <div class="upload-area" :class="{ 'dragover': isDragover }" 
         @drop="handleDrop" 
         @dragover="handleDragover" 
         @dragleave="handleDragleave"
         @click="triggerFileInput">
      <input 
        ref="fileInput" 
        type="file" 
        :accept="accept" 
        @change="handleFileSelect" 
        style="display: none"
      >
      <div v-if="!selectedFile" class="upload-placeholder">
        <i class="upload-icon">📁</i>
        <p>点击选择{{ fileTypeText }}或拖拽到此处</p>
        <span class="upload-hint">{{ acceptText }}</span>
      </div>
      <div v-else class="file-preview">
        <div class="file-info">
          <i class="file-icon">📄</i>
          <div class="file-details">
            <div class="file-name">{{ selectedFile.name }}</div>
            <div class="file-size">{{ formatFileSize(selectedFile.size) }}</div>
          </div>
          <button @click.stop="clearFile" class="clear-btn">✕</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface Props {
  accept?: string
  fileType?: 'image' | 'video' | 'any'
}

const props = withDefaults(defineProps<Props>(), {
  accept: '*/*',
  fileType: 'any'
})

const emit = defineEmits<{
  fileSelected: [file: File | null]
}>()

const fileInput = ref<HTMLInputElement>()
const selectedFile = ref<File | null>(null)
const isDragover = ref(false)

const fileTypeText = computed(() => {
  switch (props.fileType) {
    case 'image': return '图片'
    case 'video': return '视频'
    default: return '文件'
  }
})

const acceptText = computed(() => {
  switch (props.fileType) {
    case 'image': return '支持 JPG, PNG, GIF 格式'
    case 'video': return '支持 MP4, AVI, MOV 格式'
    default: return '支持多种文件格式'
  }
})

const triggerFileInput = () => {
  fileInput.value?.click()
}

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    selectedFile.value = file
    emit('fileSelected', file)
  }
}

const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  isDragover.value = false
  
  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    selectedFile.value = files[0]
    emit('fileSelected', files[0])
  }
}

const handleDragover = (event: DragEvent) => {
  event.preventDefault()
  isDragover.value = true
}

const handleDragleave = () => {
  isDragover.value = false
}

const clearFile = () => {
  selectedFile.value = null
  emit('fileSelected', null)
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
</script>

<style scoped>
.file-upload {
  margin: 20px 0;
}

.upload-area {
  border: 2px dashed #ddd;
  border-radius: 8px;
  padding: 40px 20px;
  text-align: center;
  background: #f9f9f9;
  cursor: pointer;
  transition: all 0.3s ease;
}

.upload-area:hover,
.upload-area.dragover {
  border-color: #3b87d8;
  background: #f0f7ff;
}

.upload-placeholder {
  color: #666;
}

.upload-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 10px;
}

.upload-placeholder p {
  margin: 10px 0;
  font-size: 16px;
  font-weight: 500;
}

.upload-hint {
  font-size: 14px;
  color: #999;
}

.file-preview {
  display: flex;
  justify-content: center;
}

.file-info {
  display: flex;
  align-items: center;
  background: white;
  padding: 15px;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  max-width: 300px;
}

.file-icon {
  font-size: 24px;
  margin-right: 10px;
}

.file-details {
  flex: 1;
  text-align: left;
}

.file-name {
  font-weight: 500;
  margin-bottom: 4px;
  word-break: break-all;
}

.file-size {
  font-size: 12px;
  color: #666;
}

.clear-btn {
  background: #ff4757;
  color: white;
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  cursor: pointer;
  margin-left: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.clear-btn:hover {
  background: #ff3742;
}
</style> 