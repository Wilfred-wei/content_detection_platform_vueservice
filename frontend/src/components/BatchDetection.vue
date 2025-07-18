<template>
  <div class="batch-detection">
    <div class="row">
      <!-- 左侧：上传配置 -->
      <div class="col-lg-6">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-header bg-info text-white">
            <h5 class="card-title mb-0">
              <i class="fas fa-tasks me-2"></i>
              批量检测配置
            </h5>
          </div>
          <div class="card-body">
            <!-- 上传方式选择 (仅在未上传文件时显示) -->
            <div v-if="!hasUploadedFiles && !isUploading" class="upload-method-selection mb-4">
              <h6 class="mb-3">选择上传方式</h6>
              <div class="row g-3">
                <div class="col-6">
                  <div class="upload-method-card card h-100" 
                       :class="{ 'border-primary': uploadMethod === 'zip' }"
                       @click="uploadMethod = 'zip'">
                    <div class="card-body text-center py-4">
                      <i class="fas fa-file-archive fa-3x text-primary mb-3"></i>
                      <h6>ZIP文件</h6>
                      <small class="text-muted">上传包含多张图片的ZIP压缩包</small>
                    </div>
                  </div>
                </div>
                <div class="col-6">
                  <div class="upload-method-card card h-100" 
                       :class="{ 'border-primary': uploadMethod === 'multiple' }"
                       @click="uploadMethod = 'multiple'">
                    <div class="card-body text-center py-4">
                      <i class="fas fa-images fa-3x text-primary mb-3"></i>
                      <h6>多文件选择</h6>
                      <small class="text-muted">直接选择多个图片文件</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 任务名称 -->
            <div v-if="!hasUploadedFiles && !isUploading" class="mb-4">
              <label class="form-label">任务名称</label>
              <input v-model="taskName" 
                     type="text" 
                     class="form-control" 
                     placeholder="请输入任务名称（可选）"
                     :disabled="isUploading || isProcessing">
            </div>

            <!-- ZIP文件上传 -->
            <div v-if="uploadMethod === 'zip' && !hasUploadedFiles && !isUploading" class="upload-section">
              <div class="batch-upload-area"
                   :class="{ 'dragover': isDragOver }"
                   @click="triggerZipInput"
                   @dragover.prevent="handleDragOver"
                   @dragleave.prevent="handleDragLeave"
                   @drop.prevent="handleZipDrop">
                <i class="fas fa-cloud-upload-alt fa-3x text-success mb-3"></i>
                <h5>拖拽ZIP文件到此处</h5>
                <p class="text-muted">或点击选择ZIP文件</p>
                <small class="text-muted">最大支持100MB，包含常见图片格式</small>
              </div>
              <input ref="zipInput" 
                     type="file" 
                     accept=".zip" 
                     @change="handleZipSelect" 
                     style="display: none">
            </div>

            <!-- 多文件上传 -->
            <div v-if="uploadMethod === 'multiple' && !hasUploadedFiles && !isUploading" class="upload-section">
              <div class="batch-upload-area"
                   :class="{ 'dragover': isDragOver }"
                   @click="triggerMultipleInput"
                   @dragover.prevent="handleDragOver"
                   @dragleave.prevent="handleDragLeave"
                   @drop.prevent="handleMultipleDrop">
                <i class="fas fa-images fa-3x text-success mb-3"></i>
                <h5>选择多个图片文件</h5>
                <p class="text-muted">或拖拽多个图片文件到此处</p>
                <small class="text-muted">支持JPEG、PNG、BMP、TIFF格式</small>
              </div>
              <input ref="multipleInput" 
                     type="file" 
                     accept="image/*" 
                     multiple 
                     @change="handleMultipleSelect" 
                     style="display: none">
            </div>

            <!-- 上传进度 -->
            <div v-if="isUploading" class="text-center py-4">
              <div class="spinner-border text-success mb-3"></div>
              <h5>上传中...</h5>
              <p class="text-muted">请稍候，正在处理文件</p>
              <div class="progress" style="height: 4px;">
                <div class="progress-bar progress-bar-striped progress-bar-animated" 
                     style="width: 100%"></div>
              </div>
            </div>

            <!-- 文件上传成功预览界面 -->
            <div v-if="hasUploadedFiles && !currentJob && !isUploading" class="upload-success-preview">
              <div class="card border-success">
                <div class="card-body">
                  <div class="row">
                    <!-- 左侧：文件信息 -->
                    <div class="col-md-4">
                      <div class="text-center">
                        <!-- ZIP文件预览 -->
                        <div v-if="uploadMethod === 'zip'" class="zip-preview">
                          <i class="fas fa-file-archive fa-4x text-primary mb-3"></i>
                          <h6>{{ selectedZipFile?.name }}</h6>
                          <small class="text-muted">{{ formatFileSize(selectedZipFile?.size || 0) }}</small>
                        </div>
                        <!-- 多文件第一张图片预览 -->
                        <div v-else-if="filePreviews.length > 0" class="main-preview">
                          <img :src="filePreviews[0].url" 
                               class="img-fluid rounded border shadow-sm" 
                               style="max-height: 150px; max-width: 100%;"
                               alt="预览图片">
                          <div class="mt-2">
                            <small class="text-muted">{{ filePreviews[0].name }}</small>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <!-- 右侧：详细信息 -->
                    <div class="col-md-8">
                      <h6 class="text-success mb-3">
                        <i class="fas fa-check-circle me-2"></i>
                        文件上传成功
                      </h6>
                      
                      <!-- 文件统计信息 -->
                      <div class="mb-3">
                        <p class="mb-1">
                          <strong>{{ uploadMethod === 'zip' ? 'ZIP文件' : '文件数量' }}:</strong> 
                          {{ uploadMethod === 'zip' ? selectedZipFile?.name : `${selectedFiles.length} 个文件` }}
                        </p>
                        <p class="mb-1">
                          <strong>文件类型:</strong> 
                          {{ uploadMethod === 'zip' ? 'ZIP压缩包' : '图片文件' }}
                        </p>
                        <p class="mb-1">
                          <strong>总大小:</strong> 
                          {{ formatFileSize(getTotalSize()) }}
                        </p>
                        <small class="text-muted">请确认文件正确后开始检测</small>
                      </div>
                      
                      <!-- 操作按钮 -->
                      <div class="d-flex gap-2">
                        <button class="btn btn-primary" @click="startBatchDetection">
                          <i class="fas fa-search me-2"></i>开始检测
                        </button>
                        <button class="btn btn-outline-secondary" @click="resetUpload">
                          <i class="fas fa-upload me-2"></i>重新上传
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 多文件预览网格 (仅非ZIP文件) -->
              <div v-if="uploadMethod === 'multiple' && filePreviews.length > 0" class="files-grid-preview mt-3">
                <div class="card">
                  <div class="card-header">
                    <h6 class="mb-0">
                      <i class="fas fa-images me-2"></i>
                      图片预览 ({{ filePreviews.length }} 张)
                    </h6>
                  </div>
                  <div class="card-body">
                    <div class="row g-2">
                      <!-- 显示前6个文件的预览 -->
                      <div v-for="(preview, index) in filePreviews.slice(0, 6)" 
                           :key="index" 
                           class="col-2">
                        <div class="preview-item position-relative">
                          <img :src="preview.url" 
                               class="img-fluid rounded border" 
                               style="height: 80px; width: 100%; object-fit: cover; cursor: pointer;"
                               :alt="preview.name"
                               :title="preview.name"
                               @click="showImagePreview(preview, index)">
                          <div class="preview-overlay position-absolute bottom-0 start-0 end-0 bg-dark bg-opacity-75 text-white text-center py-1" 
                               style="font-size: 10px; border-radius: 0 0 0.375rem 0.375rem;">
                            {{ truncateFileName(preview.name, 8) }}
                          </div>
                          <!-- 文件大小标签 -->
                          <div class="position-absolute top-0 end-0 bg-info text-white px-1" 
                               style="font-size: 8px; border-radius: 0 0.375rem 0 0.375rem;">
                            {{ formatFileSize(preview.size) }}
                          </div>
                        </div>
                      </div>
                      
                      <!-- 如果有更多文件，显示剩余数量 -->
                      <div v-if="filePreviews.length > 6" class="col-2">
                        <div class="more-files-indicator border rounded d-flex align-items-center justify-content-center text-muted"
                             style="height: 80px; background-color: #f8f9fa; cursor: pointer;"
                             @click="showAllFilesModal">
                          <div class="text-center">
                            <i class="fas fa-plus-circle mb-1"></i>
                            <div style="font-size: 12px;">还有</div>
                            <div style="font-size: 14px; font-weight: bold;">{{ filePreviews.length - 6 }}</div>
                            <div style="font-size: 10px;">个文件</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div class="mt-2 text-center">
                      <small class="text-muted">
                        <i class="fas fa-info-circle me-1"></i>
                        显示前6个文件预览，点击可查看大图
                      </small>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 错误信息 -->
            <div v-if="error" class="alert alert-danger mt-3">
              <i class="fas fa-exclamation-triangle me-2"></i>
              {{ error }}
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：任务状态与结果 -->
      <div class="col-lg-6">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-header bg-warning text-dark">
            <h5 class="card-title mb-0">
              <i class="fas fa-list-check me-2"></i>
              任务状态与结果
            </h5>
          </div>
          <div class="card-body">
            <!-- 无任务状态 -->
            <div v-if="!currentJob && !isProcessing" class="no-job text-center py-5">
              <i class="fas fa-clipboard-list fa-3x text-muted mb-3"></i>
              <h5 class="text-muted">暂无任务</h5>
              <p class="text-muted">请先配置并启动批量检测任务</p>
            </div>

            <!-- 任务进行中 -->
            <div v-if="currentJob || isProcessing" class="job-status">
              <!-- 任务基本信息 -->
              <div class="job-info mb-4">
                <h6 class="mb-2">
                  <i class="fas fa-tag me-2"></i>
                  {{ currentJob?.name || taskName || '批量检测任务' }}
                </h6>
                <div class="row">
                  <div class="col-6">
                    <small class="text-muted d-block">状态</small>
                    <span class="badge" :class="getStatusBadgeClass(currentJob?.status || 'processing')">
                      {{ getStatusText(currentJob?.status || 'processing') }}
                    </span>
                  </div>
                  <div class="col-6">
                    <small class="text-muted d-block">创建时间</small>
                    <span>{{ formatDateTime(currentJob?.created_at || new Date()) }}</span>
                  </div>
                </div>
              </div>

              <!-- 进度信息 -->
              <div class="progress-info mb-4">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span>检测进度</span>
                  <span class="fw-bold">
                    {{ currentJob?.processed_images || 0 }} / {{ currentJob?.total_images || getFileCount() }}
                    ({{ Math.round(((currentJob?.processed_images || 0) / (currentJob?.total_images || getFileCount() || 1)) * 100) }}%)
                  </span>
                </div>
                <div class="progress mb-3" style="height: 10px;">
                  <div class="progress-bar progress-bar-striped progress-bar-animated" 
                       :class="getProgressBarClass(currentJob?.status || 'processing')"
                       :style="{ width: Math.round(((currentJob?.processed_images || 0) / (currentJob?.total_images || getFileCount() || 1)) * 100) + '%' }">
                  </div>
                </div>
              </div>

              <!-- 统计信息 -->
              <div v-if="currentJob && currentJob.processed_images > 0" class="stats-info">
                <h6 class="mb-3">检测统计</h6>
                <div class="row g-3">
                  <div class="col-6">
                    <div class="stat-card text-center">
                      <div class="stat-value text-success">{{ currentJob.real_count || 0 }}</div>
                      <div class="stat-label">真实图像</div>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="stat-card text-center">
                      <div class="stat-value text-warning">{{ currentJob.ai_count || 0 }}</div>
                      <div class="stat-label">AI生成</div>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="stat-card text-center">
                      <div class="stat-value text-info">{{ currentJob.success_count || 0 }}</div>
                      <div class="stat-label">成功检测</div>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="stat-card text-center">
                      <div class="stat-value text-danger">{{ currentJob.failed_count || 0 }}</div>
                      <div class="stat-label">检测失败</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 批量检测结果预览 -->
              <div v-if="currentJob?.status === 'completed' && currentJob?.results && currentJob.results.length > 0" 
                   class="results-preview mt-4">
                <h6 class="mb-3">
                  <i class="fas fa-images me-2"></i>
                  检测结果预览 ({{ currentJob.results.length }} 张)
                </h6>
                <div class="results-grid">
                  <div class="row g-2">
                    <!-- 显示前8个结果的预览 -->
                    <div v-for="(result, index) in currentJob.results.slice(0, 8)" 
                         :key="result.id || index" 
                         class="col-3">
                      <div class="result-preview-item position-relative"
                           @click="showResultDetail(result, index)">
                        <!-- 结果图片 -->
                        <div class="result-image-container">
                          <img :src="result.image_url || result.original_image_url" 
                               class="img-fluid rounded border" 
                               style="height: 80px; width: 100%; object-fit: cover; cursor: pointer;"
                               :alt="result.filename"
                               onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'80\' height=\'80\' viewBox=\'0 0 80 80\'%3E%3Crect width=\'80\' height=\'80\' fill=\'%23f8f9fa\'/%3E%3Ctext x=\'40\' y=\'40\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%236c757d\'%3E无图%3C/text%3E%3C/svg%3E'">
                          
                          <!-- 检测结果标签 -->
                          <div class="position-absolute top-0 start-0 p-1">
                            <span class="badge" 
                                  :class="result.prediction === 'fake' ? 'bg-danger' : 'bg-success'"
                                  style="font-size: 10px;">
                              {{ result.prediction === 'fake' ? 'AI生成' : '真实' }}
                            </span>
                          </div>
                          
                          <!-- 置信度标签 -->
                          <div class="position-absolute top-0 end-0 p-1">
                            <span class="badge bg-info" style="font-size: 9px;">
                              {{ Math.round((result.confidence || 0) * 100) }}%
                            </span>
                          </div>
                          
                          <!-- 热力图指示器 -->
                          <div v-if="result.heatmap_url" 
                               class="position-absolute bottom-0 end-0 p-1">
                            <i class="fas fa-fire text-warning" 
                               style="font-size: 12px; text-shadow: 1px 1px 2px rgba(0,0,0,0.7);"
                               title="有热力图"></i>
                          </div>
                          
                          <!-- 悬浮遮罩 -->
                          <div class="result-overlay position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center">
                            <i class="fas fa-search-plus text-white" style="font-size: 20px; text-shadow: 1px 1px 2px rgba(0,0,0,0.7);"></i>
                          </div>
                        </div>
                        
                        <!-- 文件名 -->
                        <div class="result-filename mt-1 text-center">
                          <small class="text-muted" :title="result.filename">
                            {{ truncateFileName(result.filename || '未知文件', 12) }}
                          </small>
                        </div>
                      </div>
                    </div>
                    
                    <!-- 如果有更多结果，显示剩余数量 -->
                    <div v-if="currentJob.results.length > 8" class="col-3">
                      <div class="more-results-indicator border rounded d-flex align-items-center justify-content-center text-muted"
                           style="height: 80px; background-color: #f8f9fa; cursor: pointer;"
                           @click="showAllResultsModal">
                        <div class="text-center">
                          <i class="fas fa-plus-circle mb-1"></i>
                          <div style="font-size: 12px;">还有</div>
                          <div style="font-size: 14px; font-weight: bold;">{{ currentJob.results.length - 8 }}</div>
                          <div style="font-size: 10px;">个结果</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div class="mt-2 text-center">
                    <small class="text-muted">
                      <i class="fas fa-info-circle me-1"></i>
                      点击查看详细检测结果和热力图分析
                    </small>
                  </div>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="job-actions mt-4">
                <div class="d-grid gap-2 d-md-flex">
                  <div v-if="currentJob?.status === 'completed'" class="btn-group">
                    <button @click="downloadResults" class="btn btn-primary">
                      <i class="fas fa-download me-2"></i>下载结果
                    </button>
                    <button type="button" class="btn btn-primary dropdown-toggle dropdown-toggle-split" data-bs-toggle="dropdown">
                      <span class="visually-hidden">导出选项</span>
                    </button>
                    <ul class="dropdown-menu">
                      <li><a class="dropdown-item" href="#" @click.prevent="exportBatchResults('csv')">
                        <i class="fas fa-file-csv me-2"></i>导出CSV
                      </a></li>
                      <li><a class="dropdown-item" href="#" @click.prevent="exportBatchResults('json')">
                        <i class="fas fa-file-code me-2"></i>导出JSON
                      </a></li>
                    </ul>
                  </div>
                  <button v-if="currentJob?.status === 'processing'" 
                          @click="cancelJob" 
                          class="btn btn-outline-danger">
                    <i class="fas fa-stop me-2"></i>取消任务
                  </button>
                  <button v-if="currentJob" 
                          @click="viewJobDetails" 
                          class="btn btn-outline-info">
                    <i class="fas fa-eye me-2"></i>查看详情
                  </button>
                  <button @click="resetJob" class="btn btn-outline-secondary">
                    <i class="fas fa-redo me-2"></i>重新开始
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 图片预览模态框 -->
    <div v-if="showPreviewModal" class="modal fade show d-block" style="background-color: rgba(0,0,0,0.5);">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="fas fa-image me-2"></i>
              图片预览 ({{ currentPreviewIndex + 1 }} / {{ filePreviews.length }})
            </h5>
            <button type="button" class="btn-close" @click="closePreviewModal"></button>
          </div>
          <div class="modal-body text-center">
            <img v-if="currentPreview" 
                 :src="currentPreview.url" 
                 class="img-fluid rounded shadow"
                 style="max-height: 400px; max-width: 100%;"
                 :alt="currentPreview.name">
            <div class="mt-3">
              <h6>{{ currentPreview?.name }}</h6>
              <small class="text-muted">{{ formatFileSize(currentPreview?.size || 0) }}</small>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" 
                    class="btn btn-outline-secondary" 
                    :disabled="currentPreviewIndex <= 0"
                    @click="previousPreview">
              <i class="fas fa-chevron-left me-1"></i>上一张
            </button>
            <button type="button" 
                    class="btn btn-outline-secondary"
                    :disabled="currentPreviewIndex >= filePreviews.length - 1"
                    @click="nextPreview">
              下一张<i class="fas fa-chevron-right ms-1"></i>
            </button>
            <button type="button" class="btn btn-secondary" @click="closePreviewModal">关闭</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 检测结果详情模态框 -->
    <div v-if="showResultModal" class="modal fade show d-block" style="background-color: rgba(0,0,0,0.5);">
      <div class="modal-dialog modal-xl modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="fas fa-chart-line me-2"></i>
              检测结果详情 ({{ currentResultIndex + 1 }} / {{ (currentJob?.results || []).length }})
            </h5>
            <button type="button" class="btn-close" @click="closeResultModal"></button>
          </div>
          <div v-if="currentResult" class="modal-body">
            <!-- 文件基本信息 -->
            <div class="row mb-4">
              <div class="col-12">
                <div class="card bg-light">
                  <div class="card-body">
                    <div class="row">
                      <div class="col-md-6">
                        <h6 class="mb-2">
                          <i class="fas fa-file-image me-2"></i>
                          {{ currentResult.filename || '未知文件' }}
                        </h6>
                        <div class="row">
                          <div class="col-6">
                            <small class="text-muted d-block">检测结果</small>
                            <span class="badge" 
                                  :class="currentResult.prediction === 'fake' ? 'bg-danger' : 'bg-success'">
                              {{ currentResult.prediction === 'fake' ? 'AI生成图像' : '真实图像' }}
                            </span>
                          </div>
                          <div class="col-6">
                            <small class="text-muted d-block">置信度</small>
                            <span class="fw-bold">{{ Math.round((currentResult.confidence || 0) * 100) }}%</span>
                          </div>
                        </div>
                      </div>
                      <div class="col-md-6">
                        <div class="row">
                          <div class="col-6">
                            <small class="text-muted d-block">处理时间</small>
                            <span>{{ formatProcessingTime(currentResult.processing_time) }}</span>
                          </div>
                          <div class="col-6">
                            <small class="text-muted d-block">状态</small>
                            <span :class="'badge bg-' + (currentResult.status === 'success' ? 'success' : 'danger')">
                              {{ currentResult.status === 'success' ? '检测成功' : '检测失败' }}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 图像对比显示 -->
            <div class="row">
              <!-- 原始图像 -->
              <div class="col-md-6">
                <div class="card">
                  <div class="card-header">
                    <h6 class="mb-0">
                      <i class="fas fa-image me-2"></i>
                      原始图像
                    </h6>
                  </div>
                  <div class="card-body text-center">
                    <img :src="currentResult.image_url || currentResult.original_image_url" 
                         class="img-fluid rounded shadow-sm" 
                         style="max-height: 350px; max-width: 100%;"
                         :alt="currentResult.filename"
                         onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'200\' viewBox=\'0 0 300 200\'%3E%3Crect width=\'300\' height=\'200\' fill=\'%23f8f9fa\' stroke=\'%23dee2e6\'/%3E%3Ctext x=\'150\' y=\'100\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%236c757d\' font-size=\'16\'%3E图片加载失败%3C/text%3E%3C/svg%3E'">
                    <div class="mt-2">
                      <small class="text-muted">点击可查看大图</small>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 热力图分析 -->
              <div class="col-md-6">
                <div class="card">
                  <div class="card-header d-flex justify-content-between align-items-center">
                    <h6 class="mb-0">
                      <i class="fas fa-fire me-2"></i>
                      热力图分析
                    </h6>
                    <div v-if="currentResult.heatmap_url">
                      <small class="text-info">
                        <i class="fas fa-info-circle me-1"></i>
                        红色区域表示AI生成特征
                      </small>
                    </div>
                  </div>
                  <div class="card-body text-center">
                    <!-- 有热力图时显示 -->
                    <div v-if="currentResult.heatmap_url">
                      <img :src="currentResult.heatmap_url" 
                           class="img-fluid rounded shadow-sm" 
                           style="max-height: 350px; max-width: 100%;"
                           :alt="'热力图 - ' + currentResult.filename"
                           onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'200\' viewBox=\'0 0 300 200\'%3E%3Crect width=\'300\' height=\'200\' fill=\'%23f8f9fa\' stroke=\'%23dee2e6\'/%3E%3Ctext x=\'150\' y=\'100\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%236c757d\' font-size=\'16\'%3E热力图加载失败%3C/text%3E%3C/svg%3E'">
                      <div class="mt-2">
                        <small class="text-muted">AI检测区域热力图</small>
                      </div>
                    </div>
                    <!-- 真实图像或无热力图时显示 -->
                    <div v-else-if="currentResult.prediction === 'real'" class="text-success py-5">
                      <i class="fas fa-check-circle fa-4x mb-3"></i>
                      <h5>真实图像</h5>
                      <p class="text-muted">检测为真实图像，无需生成热力图</p>
                    </div>
                    <!-- 其他情况 -->
                    <div v-else class="text-muted py-5">
                      <i class="fas fa-exclamation-triangle fa-4x mb-3"></i>
                      <h5>热力图生成失败</h5>
                      <p class="text-muted">检测过程中出现错误，无法生成热力图</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 置信度可视化 -->
            <div v-if="currentResult.confidence" class="row mt-4">
              <div class="col-12">
                <div class="card">
                  <div class="card-header">
                    <h6 class="mb-0">
                      <i class="fas fa-chart-bar me-2"></i>
                      置信度分析
                    </h6>
                  </div>
                  <div class="card-body">
                    <div class="row align-items-center">
                      <div class="col-md-8">
                        <div class="d-flex align-items-center mb-2">
                          <span class="me-3" style="min-width: 80px;">置信度:</span>
                          <div class="flex-grow-1">
                            <div class="progress" style="height: 20px;">
                              <div class="progress-bar" 
                                   :class="currentResult.prediction === 'fake' ? 'bg-danger' : 'bg-success'"
                                   :style="{ width: Math.round((currentResult.confidence || 0) * 100) + '%' }">
                                {{ Math.round((currentResult.confidence || 0) * 100) }}%
                              </div>
                            </div>
                          </div>
                        </div>
                        <small class="text-muted">
                          {{ currentResult.prediction === 'fake' 
                              ? '置信度越高，表示越可能是AI生成图像' 
                              : '置信度越高，表示越可能是真实图像' }}
                        </small>
                      </div>
                      <div class="col-md-4 text-center">
                        <div class="confidence-circle d-inline-flex align-items-center justify-content-center"
                             :style="{ 
                               width: '80px', 
                               height: '80px', 
                               borderRadius: '50%',
                               background: `conic-gradient(${currentResult.prediction === 'fake' ? '#dc3545' : '#198754'} ${Math.round((currentResult.confidence || 0) * 100) * 3.6}deg, #e9ecef 0deg)`
                             }">
                          <div class="bg-white rounded-circle d-flex align-items-center justify-content-center"
                               style="width: 60px; height: 60px;">
                            <span class="fw-bold">{{ Math.round((currentResult.confidence || 0) * 100) }}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" 
                    class="btn btn-outline-secondary" 
                    :disabled="currentResultIndex <= 0"
                    @click="previousResult">
              <i class="fas fa-chevron-left me-1"></i>上一个结果
            </button>
            <button type="button" 
                    class="btn btn-outline-secondary"
                    :disabled="currentResultIndex >= (currentJob?.results || []).length - 1"
                    @click="nextResult">
              下一个结果<i class="fas fa-chevron-right ms-1"></i>
            </button>
                         <button v-if="currentResult?.heatmap_url || currentResult?.image_url" 
                     type="button" 
                     class="btn btn-outline-info"
                     @click="downloadCurrentImage">
               <i class="fas fa-download me-1"></i>
               {{ currentResult?.heatmap_url ? '下载热力图' : '下载图片' }}
             </button>
            <button type="button" class="btn btn-secondary" @click="closeResultModal">关闭</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue'
import { aiImageAPI } from '../api'

export default defineComponent({
  name: 'BatchDetection',
  emits: ['job-created'],
  setup(props, { emit }) {
    // 响应式数据
    const uploadMethod = ref<'zip' | 'multiple'>('zip')
    const taskName = ref<string>('')
    const selectedZipFile = ref<File | null>(null)
    const selectedFiles = ref<File[]>([])
    const filePreviews = ref<Array<{name: string, url: string, size: number}>>([])
    const isDragOver = ref<boolean>(false)
    const isUploading = ref<boolean>(false)
    const isProcessing = ref<boolean>(false)
    const currentJob = ref<any>(null)
    const error = ref<string | null>(null)
    
    // 图片预览相关
    const showPreviewModal = ref<boolean>(false)
    const currentPreviewIndex = ref<number>(0)
    const currentPreview = ref<{name: string, url: string, size: number} | null>(null)
    
    // 检测结果预览相关
    const showResultModal = ref<boolean>(false)
    const currentResultIndex = ref<number>(0)
    const currentResult = ref<any>(null)

    // 计算属性
    const canStartDetection = computed(() => {
      return uploadMethod.value === 'zip' 
        ? selectedZipFile.value !== null 
        : selectedFiles.value.length > 0
    })

    const hasUploadedFiles = computed(() => {
      return uploadMethod.value === 'zip' 
        ? selectedZipFile.value !== null 
        : selectedFiles.value.length > 0
    })

    // 文件处理方法
    const triggerZipInput = () => {
      ;(document.querySelector('input[type="file"][accept=".zip"]') as HTMLInputElement)?.click()
    }

    const triggerMultipleInput = () => {
      ;(document.querySelector('input[type="file"][multiple]') as HTMLInputElement)?.click()
    }

    const handleZipSelect = (event: Event) => {
      const target = event.target as HTMLInputElement
      if (target.files && target.files[0]) {
        selectedZipFile.value = target.files[0]
        error.value = null
      }
    }

    const handleMultipleSelect = (event: Event) => {
      const target = event.target as HTMLInputElement
      if (target.files) {
        const files = Array.from(target.files)
        selectedFiles.value = files
        generateFilePreviews(files)
        error.value = null
      }
    }

    // 生成文件预览
    const generateFilePreviews = (files: File[]) => {
      filePreviews.value = []
      files.forEach((file, index) => {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader()
          reader.onload = (e) => {
            filePreviews.value.push({
              name: file.name,
              url: e.target?.result as string,
              size: file.size
            })
          }
          reader.readAsDataURL(file)
        }
      })
    }

    const handleDragOver = () => {
      isDragOver.value = true
    }

    const handleDragLeave = () => {
      isDragOver.value = false
    }

    const handleZipDrop = (event: DragEvent) => {
      isDragOver.value = false
      const files = event.dataTransfer?.files
      if (files && files[0] && files[0].name.endsWith('.zip')) {
        selectedZipFile.value = files[0]
        error.value = null
      }
    }

    const handleMultipleDrop = (event: DragEvent) => {
      isDragOver.value = false
      const files = event.dataTransfer?.files
      if (files) {
        const imageFiles = Array.from(files).filter(file => 
          file.type.startsWith('image/')
        )
        selectedFiles.value = imageFiles
        generateFilePreviews(imageFiles)
        error.value = null
      }
    }

    const clearZipFile = () => {
      selectedZipFile.value = null
    }

    const clearMultipleFiles = () => {
      selectedFiles.value = []
      filePreviews.value = []
    }

    // 重置上传
    const resetUpload = () => {
      selectedZipFile.value = null
      selectedFiles.value = []
      filePreviews.value = []
      error.value = null
    }

    // 获取文件总大小
    const getTotalSize = () => {
      if (uploadMethod.value === 'zip' && selectedZipFile.value) {
        return selectedZipFile.value.size
      } else {
        return selectedFiles.value.reduce((total, file) => total + file.size, 0)
      }
    }

    // 获取文件数量
    const getFileCount = () => {
      if (uploadMethod.value === 'zip') {
        return 1 // ZIP文件按1个计算，实际解压后的数量由后端返回
      } else {
        return selectedFiles.value.length
      }
    }

    // 截断文件名
    const truncateFileName = (fileName: string, maxLength: number) => {
      if (fileName.length <= maxLength) return fileName
      const ext = fileName.split('.').pop()
      const name = fileName.substring(0, fileName.lastIndexOf('.'))
      const truncated = name.substring(0, maxLength - (ext ? ext.length + 1 : 0))
      return ext ? `${truncated}...` : `${truncated}...`
    }

    // 图片预览相关方法
    const showImagePreview = (preview: {name: string, url: string, size: number}, index: number) => {
      currentPreview.value = preview
      currentPreviewIndex.value = index
      showPreviewModal.value = true
    }

    const closePreviewModal = () => {
      showPreviewModal.value = false
      currentPreview.value = null
      currentPreviewIndex.value = 0
    }

    const previousPreview = () => {
      if (currentPreviewIndex.value > 0) {
        currentPreviewIndex.value--
        currentPreview.value = filePreviews.value[currentPreviewIndex.value]
      }
    }

    const nextPreview = () => {
      if (currentPreviewIndex.value < filePreviews.value.length - 1) {
        currentPreviewIndex.value++
        currentPreview.value = filePreviews.value[currentPreviewIndex.value]
      }
    }

    const showAllFilesModal = () => {
      // 这里可以实现显示所有文件的模态框
      console.log('显示所有文件列表')
    }

    // 检测结果相关方法
    const showResultDetail = (result: any, index: number) => {
      currentResult.value = result
      currentResultIndex.value = index
      showResultModal.value = true
    }

    const closeResultModal = () => {
      showResultModal.value = false
      currentResult.value = null
      currentResultIndex.value = 0
    }

    const previousResult = () => {
      if (currentResultIndex.value > 0 && currentJob.value?.results) {
        currentResultIndex.value--
        currentResult.value = currentJob.value.results[currentResultIndex.value]
      }
    }

    const nextResult = () => {
      if (currentResultIndex.value < (currentJob.value?.results?.length || 0) - 1 && currentJob.value?.results) {
        currentResultIndex.value++
        currentResult.value = currentJob.value.results[currentResultIndex.value]
      }
    }

    const showAllResultsModal = () => {
      // 这里可以实现显示所有结果的模态框
      console.log('显示所有检测结果')
    }

    const downloadCurrentImage = async () => {
      // 优先下载热力图，如果没有热力图再下载原图
      const downloadUrl = currentResult.value?.heatmap_url || currentResult.value?.image_url
      if (!downloadUrl) {
        console.error('无图片URL可下载')
        alert('无可用的图片进行下载')
        return
      }

      try {
        const response = await fetch(downloadUrl)
        if (!response.ok) throw new Error('下载失败')
        
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        
        // 生成文件名
        const ext = downloadUrl.split('.').pop() || 'jpg'
        const filename = currentResult.value.filename || `result_${currentResult.value.id || Date.now()}`
        const baseFilename = filename.includes('.') ? filename.substring(0, filename.lastIndexOf('.')) : filename
        
        // 根据下载的是热力图还是原图来命名
        const isHeatmap = downloadUrl === currentResult.value?.heatmap_url
        const suffix = isHeatmap ? '_heatmap' : '_original'
        link.download = `${baseFilename}${suffix}.${ext}`
        
        document.body.appendChild(link)
        link.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(link)
        
        console.log(`${isHeatmap ? '热力图' : '原图'}下载完成`)
      } catch (error) {
        console.error('下载图片失败:', error)
        alert('下载失败，请重试')
      }
    }

    // 格式化处理时间
    const formatProcessingTime = (time: number | undefined) => {
      if (!time) return '未知'
      if (time < 1) {
        return `${Math.round(time * 1000)}ms`
      } else {
        return `${time.toFixed(2)}s`
      }
    }

    // 检测方法
    const startBatchDetection = async () => {
      if (!canStartDetection.value) return

      isUploading.value = true
      error.value = null

      try {
        let response
        
        if (uploadMethod.value === 'zip' && selectedZipFile.value) {
          // ZIP文件上传
          const formData = new FormData()
          formData.append('zip_file', selectedZipFile.value)
          if (taskName.value) {
            formData.append('name', taskName.value)
          }
          
          // 调用批量检测API
          response = await fetch('http://localhost:8002/detect/batch', {
            method: 'POST',
            body: formData
          })
        } else if (uploadMethod.value === 'multiple' && selectedFiles.value.length > 0) {
          // 多文件上传
          const formData = new FormData()
          selectedFiles.value.forEach((file) => {
            formData.append('images', file)
          })
          if (taskName.value) {
            formData.append('name', taskName.value)
          }
          
          response = await fetch('http://localhost:8002/detect/batch', {
            method: 'POST',
            body: formData
          })
        }

        if (response?.ok) {
          const jobData = await response.json()
          currentJob.value = jobData
          isProcessing.value = false  // 因为是同步处理，直接完成
          emit('job-created', jobData)
        } else {
          const errorData = await response?.json()
          throw new Error(errorData?.error || '批量检测任务创建失败')
        }
      } catch (err: any) {
        error.value = err.message || '批量检测启动失败，请重试'
      } finally {
        isUploading.value = false
      }
    }



    const pollJobStatus = async () => {
      if (!currentJob.value?.id) return

      try {
        const response = await fetch(`http://localhost:8002/batch/${currentJob.value.id}/status`)
        if (response.ok) {
          const jobData = await response.json()
          currentJob.value = { ...currentJob.value, ...jobData }
          
          if (jobData.status === 'processing') {
            // 继续轮询
            setTimeout(pollJobStatus, 2000)
          } else {
            isProcessing.value = false
          }
        }
      } catch (err) {
        console.error('轮询任务状态失败:', err)
      }
    }

    const cancelJob = async () => {
      if (!currentJob.value?.id) return
      
      try {
        const response = await fetch(`http://localhost:8002/batch/${currentJob.value.id}/cancel`, {
          method: 'POST'
        })
        if (response.ok) {
          currentJob.value.status = 'cancelled'
          isProcessing.value = false
        }
      } catch (err) {
        error.value = '取消任务失败'
      }
    }

    const downloadResults = () => {
      // 实现下载批量检测结果功能
      console.log('下载批量检测结果')
    }

    const exportBatchResults = (format: 'csv' | 'json' | 'xlsx') => {
      if (!currentJob.value || !currentJob.value.results) {
        console.error('没有批量检测结果可导出')
        return
      }

      const results = currentJob.value.results
      const jobInfo = {
        id: currentJob.value.id,
        name: currentJob.value.name,
        total_images: currentJob.value.total_images,
        processed_images: currentJob.value.processed_images,
        real_count: currentJob.value.real_count,
        ai_count: currentJob.value.ai_count,
        success_count: currentJob.value.success_count,
        failed_count: currentJob.value.failed_count,
        created_at: currentJob.value.created_at,
        completed_at: new Date().toISOString()
      }

      if (format === 'csv') {
        exportBatchToCSV(results, jobInfo)
      } else if (format === 'json') {
        exportBatchToJSON(results, jobInfo)
      }
    }

    const exportBatchToCSV = (results: any[], jobInfo: any) => {
      const headers = ['序号', '文件名', '检测结果', '置信度(%)', '处理时间(秒)', '状态']
      const rows = [headers.join(',')]

      results.forEach((result, index) => {
        const row = [
          index + 1,
          `"${result.filename || '未知'}"`,
          result.prediction === 'fake' ? 'AI生成' : '真实图像',
          result.confidence ? (result.confidence * 100).toFixed(1) : '未知',
          result.processing_time ? result.processing_time.toFixed(2) : '未知',
          result.status === 'success' ? '成功' : '失败'
        ]
        rows.push(row.join(','))
      })

      const csvContent = '\uFEFF' + rows.join('\n')
      downloadFile(csvContent, `batch_results_${jobInfo.id}_${Date.now()}.csv`, 'text/csv')
    }

    const exportBatchToJSON = (results: any[], jobInfo: any) => {
      const exportData = {
        job_info: jobInfo,
        summary: {
          total_images: jobInfo.total_images,
          processed_images: jobInfo.processed_images,
          real_count: jobInfo.real_count,
          ai_count: jobInfo.ai_count,
          success_rate: ((jobInfo.success_count / jobInfo.total_images) * 100).toFixed(1) + '%'
        },
        results: results.map((result, index) => ({
          index: index + 1,
          filename: result.filename,
          prediction: result.prediction,
          confidence: result.confidence,
          processing_time: result.processing_time,
          status: result.status,
          detected_at: result.created_at || new Date().toISOString()
        })),
        export_info: {
          export_time: new Date().toISOString(),
          export_format: 'json',
          version: '1.0'
        }
      }

      const jsonContent = JSON.stringify(exportData, null, 2)
      downloadFile(jsonContent, `batch_results_${jobInfo.id}_${Date.now()}.json`, 'application/json')
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

    const viewJobDetails = () => {
      // 实现查看任务详情功能
      console.log('查看任务详情:', currentJob.value)
    }

    const resetJob = () => {
      currentJob.value = null
      isProcessing.value = false
      selectedZipFile.value = null
      selectedFiles.value = []
      taskName.value = ''
      error.value = null
    }

    // 工具方法
    const formatFileSize = (bytes: number): string => {
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    const formatDateTime = (date: Date | string): string => {
      const d = new Date(date)
      return d.toLocaleString('zh-CN')
    }

    const getStatusBadgeClass = (status: string): string => {
      const classMap: Record<string, string> = {
        'pending': 'bg-secondary',
        'processing': 'bg-primary',
        'completed': 'bg-success',
        'failed': 'bg-danger',
        'cancelled': 'bg-warning'
      }
      return classMap[status] || 'bg-secondary'
    }

    const getStatusText = (status: string): string => {
      const textMap: Record<string, string> = {
        'pending': '等待中',
        'processing': '处理中',
        'completed': '已完成',
        'failed': '失败',
        'cancelled': '已取消'
      }
      return textMap[status] || '未知'
    }

    const getProgressBarClass = (status: string): string => {
      const classMap: Record<string, string> = {
        'processing': 'bg-primary',
        'completed': 'bg-success',
        'failed': 'bg-danger'
      }
      return classMap[status] || 'bg-primary'
    }

    return {
      // 数据
      uploadMethod,
      taskName,
      selectedZipFile,
      selectedFiles,
      filePreviews,
      isDragOver,
      isUploading,
      isProcessing,
      currentJob,
      error,
      showPreviewModal,
      currentPreviewIndex,
      currentPreview,
      showResultModal,
      currentResultIndex,
      currentResult,
      
      // 计算属性
      canStartDetection,
      hasUploadedFiles,
      
      // 方法
      triggerZipInput,
      triggerMultipleInput,
      handleZipSelect,
      handleMultipleSelect,
      generateFilePreviews,
      handleDragOver,
      handleDragLeave,
      handleZipDrop,
      handleMultipleDrop,
      clearZipFile,
      clearMultipleFiles,
      resetUpload,
      getTotalSize,
      getFileCount,
      truncateFileName,
      showImagePreview,
      closePreviewModal,
      previousPreview,
      nextPreview,
      showAllFilesModal,
      showResultDetail,
      closeResultModal,
      previousResult,
      nextResult,
      showAllResultsModal,
      downloadCurrentImage,
      formatProcessingTime,
      startBatchDetection,
      cancelJob,
      downloadResults,
      exportBatchResults,
      viewJobDetails,
      resetJob,
      formatFileSize,
      formatDateTime,
      getStatusBadgeClass,
      getStatusText,
      getProgressBarClass
    }
  }
})
</script>

<style scoped>
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

.files-preview {
  text-align: left;
  max-width: 100%;
}

.files-list {
  max-height: 120px;
  overflow-y: auto;
  margin: 1rem 0;
}

.file-item {
  padding: 0.25rem 0;
  font-size: 0.9rem;
}

.stat-card {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
}

.stat-label {
  font-size: 0.8rem;
  color: #6c757d;
  margin-top: 0.25rem;
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

.progress {
  background-color: #e9ecef;
}

/* 文件预览相关样式 */
.upload-success-preview {
  margin-top: 1rem;
}

.zip-preview {
  padding: 1rem;
}

.main-preview img {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.files-grid-preview {
  max-height: 300px;
  overflow-y: auto;
}

.preview-item {
  transition: transform 0.2s ease;
  border-radius: 0.375rem;
  overflow: hidden;
}

.preview-item:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.preview-overlay {
  transition: opacity 0.2s ease;
  opacity: 0.8;
}

.preview-item:hover .preview-overlay {
  opacity: 1;
}

.more-files-indicator {
  transition: all 0.2s ease;
}

.more-files-indicator:hover {
  background-color: #e9ecef !important;
  transform: scale(1.05);
}

/* 检测结果预览相关样式 */
.results-preview {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid #e9ecef;
}

.results-grid {
  max-height: 300px;
  overflow-y: auto;
}

.result-preview-item {
  transition: all 0.2s ease;
  border-radius: 0.375rem;
  overflow: hidden;
  cursor: pointer;
}

.result-preview-item:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.result-image-container {
  position: relative;
  border-radius: 0.375rem;
  overflow: hidden;
}

.result-overlay {
  background: rgba(0, 0, 0, 0.6);
  opacity: 0;
  transition: opacity 0.2s ease;
  border-radius: 0.375rem;
}

.result-preview-item:hover .result-overlay {
  opacity: 1;
}

.result-filename {
  padding: 0.25rem 0;
}

.more-results-indicator {
  transition: all 0.2s ease;
}

.more-results-indicator:hover {
  background-color: #e9ecef !important;
  transform: scale(1.05);
}

/* 检测结果详情模态框样式 */
.confidence-circle {
  transition: all 0.3s ease;
}

.confidence-circle:hover {
  transform: scale(1.1);
}

/* 模态框样式 */
.modal {
  backdrop-filter: blur(4px);
}

.modal-content {
  border: none;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
}

.modal-header {
  border-bottom: 1px solid #e9ecef;
  background: #f8f9fa;
  border-radius: 12px 12px 0 0;
}

.modal-footer {
  border-top: 1px solid #e9ecef;
  background: #f8f9fa;
  border-radius: 0 0 12px 12px;
}

/* 大屏模态框特殊样式 */
.modal-xl .modal-body {
  max-height: 70vh;
  overflow-y: auto;
}

.modal-xl .card-body img {
  transition: transform 0.2s ease;
}

.modal-xl .card-body img:hover {
  transform: scale(1.02);
  cursor: zoom-in;
}

@media (max-width: 768px) {
  .batch-upload-area {
    padding: 1.5rem;
    min-height: 150px;
  }
  
  .upload-method-card .card-body {
    padding: 1rem;
  }

  .preview-item {
    margin-bottom: 0.5rem;
  }

  .files-grid-preview .col-2 {
    flex: 0 0 33.333333%;
    max-width: 33.333333%;
  }

  .modal-dialog {
    margin: 1rem;
  }

  .results-grid .col-3 {
    flex: 0 0 50%;
    max-width: 50%;
  }

  .result-preview-item img {
    height: 60px !important;
  }

  .modal-xl .modal-dialog {
    margin: 0.5rem;
  }

  .modal-xl .modal-body {
    max-height: 60vh;
    padding: 1rem;
  }

  .confidence-circle {
    width: 60px !important;
    height: 60px !important;
  }

  .confidence-circle > div {
    width: 45px !important;
    height: 45px !important;
  }
}
</style> 