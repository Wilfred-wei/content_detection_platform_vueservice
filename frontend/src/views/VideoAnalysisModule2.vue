<template>
  <div class="page-layout">
    <!-- Sidebar -->
    <aside class="layout-sidebar">
      <Sidebar />
    </aside>
    
    <!-- Main Content Area -->
    <main class="layout-main">
        <div class="content-area">
          <h2>视频语义理解</h2>
          <div style="margin-bottom: 20px; color: #666; font-size: 1.1em; line-height: 1.6;">
          基于先进AI技术的视频内容语义理解系统，对上传视频进行分析并给出其简要概括。
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 20px;">
            <!-- Upload and Result Area -->
            <div style="display: flex; gap: 20px;">
              <!-- Left Upload Area -->
              <div style="flex: 1; display: flex; flex-direction: column; gap: 20px; padding: 10px; box-sizing: border-box;">
                <!-- Single Video Upload -->
                <div class="feature-item" style="height: 300px; box-sizing: border-box;">
                  <h4>单视频检测</h4>
                  <label 
                    style="border: 2px dashed #ddd; border-radius: 8px; height: calc(100% - 30px);
                      display: flex; flex-direction: column; justify-content: center; 
                      align-items: center; cursor: pointer; box-sizing: border-box;"
                    for="singleVideoInput">
                    <p>点击或拖放视频文件，支持mp4，avi格式，最大500MB</p>
                    <input type="file" id="singleVideoInput" style="display: none;" accept="video/*" @change="handleSingleUpload">
                  </label>
                </div>
                
                <!-- Multi Video Upload -->
                <div class="feature-item" style="height: 300px; box-sizing: border-box;">
                  <h4>批量视频检测</h4>
                  <label 
                    style="border: 2px dashed #ddd; border-radius: 8px; height: calc(100% - 30px);
                      display: flex; flex-direction: column; justify-content: center; 
                      align-items: center; cursor: pointer; box-sizing: border-box;"
                    for="multiVideoInput">
                    <p>点击或拖放多个视频，支持mp4，avi格式，最大500MB</p>
                    <input type="file" id="multiVideoInput" style="display: none;" accept="video/*" multiple @change="handleMultiUpload">
                  </label>
                </div>
              </div>
            
              <!-- Right Result Area -->
              <div style="flex: 1.5; display: flex; flex-direction: column; gap: 20px;">
                <!-- Semantic Analysis Result Display -->
                <div class="feature-item" style="margin: 0; flex: 1; display: flex; flex-direction: column;">
                  <h4>语义分析结果</h4>
                  <div style="flex: 1; padding: 15px; display: flex; flex-direction: column;">
                    <div id="semanticResult" style="flex: 1; border: 1px solid #eee; border-radius: 5px; padding: 15px; overflow-y: auto; background: #f9f9f9;">
                      <div v-if="isAnalyzing" style="text-align: center;">
                        <div class="spinner-border text-primary" role="status">
                          <span class="visually-hidden">Loading...</span>
                        </div>
                        <p style="margin-top: 10px;">正在分析中，请稍候...</p>
                      </div>
                      <p v-else-if="!currentResult.semanticText" style="color: #999; text-align: center;">请上传视频获取语义分析结果</p>
                      <div v-else>
                        <div style="margin-bottom: 10px;">
                          <strong style="color: #0056b3;">分析结果：</strong>
                          <p style="white-space: pre-wrap;">{{ currentResult.semanticText }}</p>
                        </div>
                      </div>
                    </div>
                    <div id="videoMeta" style="margin-top: 15px; color: #666; font-size: 0.9em;">
                      <p v-if="currentResult.videoName">视频名称: {{ currentResult.videoName }}</p>
                      <p v-if="currentResult.analysisDate">分析时间: {{ currentResult.analysisDate }}</p>
                    </div>
                  </div>
                </div>
                
                <!-- Latest Records Display -->
                <div class="feature-item" style="margin: 0; flex: 1; display: flex; flex-direction: column;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h4 style="margin: 0;">最新记录</h4>
                    <button class="btn-primary" style="padding: 5px 10px;" @click="showHistoryModal">更多</button>
                  </div>
                  <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
                    <div id="latestRecord" style="text-align: center; color: #666;">
                      <p v-if="historyData.length === 0">暂无分析记录</p>
                      <div v-else>
                        <p><strong>{{ latestRecord.filename }}</strong></p>
                        <p>{{ latestRecord.date }}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Example Video Analysis Area -->
            <div class="content-area">
              <h2>示例视频分析</h2>
              
              <div class="feature-overview" style="grid-template-columns: repeat(3, 1fr);">
                <div class="feature-item">
                  <div style="width: 100%; height: 200px;
                    overflow: hidden;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    background: #000;">
                    <video controls 
                      style="max-width: 100%; 
                              max-height: 100%;
                              object-fit: contain;">
                      <source :src="getVideoUrl('example3_2_2_News.mp4')" type="video/mp4">
                    </video>
                  </div>
                  <h4>新闻视频示例</h4>
                  <p>新闻报道视频示例，输出对新闻内容的简要概括。</p>
                  <button class="btn-primary" @click="analyzeExample('example3_2_2_News.mp4')">分析此示例</button>
                </div>
                
                <div class="feature-item">
                  <div style="width: 100%; height: 200px;
                    overflow: hidden;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    background: #000;">
                    <video controls 
                      style="max-width: 100%; 
                              max-height: 100%;
                              object-fit: contain;">
                      <source :src="getVideoUrl('example3_2_2_Life.mp4')" type="video/mp4">
                    </video>
                  </div>
                  <h4>生活视频示例</h4>
                  <p>生活类型视频示例，输出对视频内容的简要概括。</p>
                  <button class="btn-primary" @click="analyzeExample('example3_2_2_Life.mp4')">分析此示例</button>
                </div>
                
                <div class="feature-item">
                  <div style="width: 100%; height: 200px;
                    overflow: hidden;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    background: #000;">
                    <video controls 
                      style="max-width: 100%; 
                              max-height: 100%;
                              object-fit: contain;">
                      <source :src="getVideoUrl('example3_2_2_Mil.mp4')" type="video/mp4">
                    </video>
                  </div>
                  <h4>军事视频示例</h4>
                  <p>军事类型视频示例，输出对军事视频内容的简要概括。</p>
                  <button class="btn-primary" @click="analyzeExample('example3_2_2_Mil.mp4')">分析此示例</button>
                </div>
              </div>
            </div>
          </div>
        </div>
    </main>
  </div>

  <!-- History List Modal -->
  <div class="modal fade" id="historyModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">历史分析记录</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <!-- Search Functionality -->
          <div style="display: flex; gap: 10px; margin-bottom: 15px; align-items: center;">
            <input type="text" id="searchInput" class="form-control" placeholder="输入搜索内容" v-model="searchQuery">
            <button class="btn-primary" @click="searchHistory">搜索</button>
            <button class="btn btn-secondary" @click="resetSearch">重置</button>
          </div>
          
          <div class="task-table-wrapper">
            <table class="history-table">
              <thead>
                <tr>
                  <th>序号</th>
                  <th>提交时间</th>
                  <th>视频名称</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody id="historyTableBody">
                <tr v-for="(item, index) in filteredHistory" :key="item.id">
                  <td>{{ index + 1 }}</td>
                  <td>{{ item.date }}</td>
                  <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">{{ item.filename }}</td>
                  <td class="task-actions">
                    <button class="btn-view" @click="showDetailModal(item.id)">查看</button>
                    <button class="btn-delete" @click="deleteRecord(item.id)">删除</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-danger" @click="deleteAllRecords">一键删除</button>
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
        </div>
      </div>
    </div>
  </div>

  <!-- History Detail Modal -->
  <div class="modal fade" id="historyDetailModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">语义分析详情</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body" style="text-align: left;">
          <div id="detailVideoName" style="font-weight: bold; margin-bottom: 15px; font-size: 18px;">视频: {{ currentDetail.filename }}</div>
          <div style="max-height: 400px; overflow-y: auto; padding: 15px; background: #f9f9f9; border-radius: 5px;">
            <pre id="detailSemanticText" style="white-space: pre-wrap; margin: 0; font-family: inherit; line-height: 1.5;">{{ currentDetail.semantic_text }}</pre>
          </div>
          <div id="detailTimestamp" style="color: #888; margin-top: 15px;">分析时间: {{ currentDetail.date }}</div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { Modal } from 'bootstrap';
import Sidebar from '../components/Sidebar.vue';
import { module2API } from '../api';

export default {
  name: 'VideoAnalysisModule2',
  components: {
    Sidebar
  },
  data() {
    return {
      historyData: [],
      searchQuery: '',
      currentResult: {
        semanticText: '',
        videoName: '',
        analysisDate: ''
      },
      currentDetail: {
        filename: '',
        semantic_text: '',
        date: ''
      },
      isAnalyzing: false, // 新增分析状态
      historyModal: null,
      detailModal: null
    };
  },
  computed: {
    filteredHistory() {
      if (!this.searchQuery) {
        return this.historyData;
      }
      const query = this.searchQuery.toLowerCase();
      return this.historyData.filter(item => 
        item.filename.toLowerCase().includes(query) ||
        item.date.includes(query)
      );
    },
    latestRecord() {
      return this.historyData.length > 0 ? this.historyData[this.historyData.length - 1] : {};
    }
  },
  mounted() {
    this.historyModal = new Modal(document.getElementById('historyModal'));
    this.detailModal = new Modal(document.getElementById('historyDetailModal'));
    this.loadHistory();
  },
  methods: {
    resetResults() {
      this.currentResult = {
        semanticText: '',
        videoName: '',
        analysisDate: ''
      };
    },

    async loadHistory() {
      try {
        const data = await module2API.getHistory();
        this.historyData = data;
      } catch (error) {
        console.error('加载历史记录失败:', error);
      }
    },
    showHistoryModal() {
      this.historyModal.show();
    },
    async showDetailModal(id) {
      try {
        const response = await module2API.getHistoryDetail(id);
        
        if (response.error) {
          alert(response.error);
          return;
        }

        const record = response.result;
        if (!record) {
          alert('未获取到记录数据');
          return;
        }

        this.currentDetail = {
          filename: record.filename,
          semantic_text: record.semantic_text,
          date: record.date
        };
        
        this.detailModal.show();
      } catch (error) {
        console.error('获取详情失败:', error);
        alert('获取详情失败: ' + error.message);
      }
    },
    async deleteRecord(id) {
      if(confirm('确定删除这条记录吗？')) {
        try {
          const data = await module2API.deleteHistory(id);
          if(data.status === "success") {
            this.loadHistory();
          }
        } catch (error) {
          console.error('删除失败:', error);
          alert('删除失败，请稍后重试');
        }
      }
    },
    async deleteAllRecords() {
      const confirmMessage = this.searchQuery 
        ? `确定要删除所有搜索结果吗？` 
        : "确定要删除所有历史记录吗？";
      
      if (confirm(confirmMessage)) {
        try {
          const data = await module2API.deleteAllHistory();
          if(data.status === "success") {
            this.loadHistory();
            this.searchQuery = '';
          }
        } catch (error) {
          console.error('删除失败:', error);
          alert('删除失败，请稍后重试');
        }
      }
    },
    searchHistory() {
      // Computed property handles the filtering
    },
    resetSearch() {
      this.searchQuery = '';
    },
    handleSingleUpload(event) {
      if (event.target.files.length > 0) {
        this.handleFileUpload(event.target.files[0], true);
      }
    },
    handleMultiUpload(event) {
      if (event.target.files.length > 0) {
        this.handleBatchUpload(event.target.files);
      }
    },
    async handleFileUpload(file, isSingle) {
      this.isAnalyzing = true;
      this.resetResults();
      this.currentResult.videoName = file.name;
      
      try {
        const data = await module2API.uploadSingle(file);
        
        if(data.status === "success") {
          this.currentResult.semanticText = data.result.semantic_text;
          this.currentResult.analysisDate = new Date().toLocaleString();
          
          this.loadHistory();
        } else {
          throw new Error(data.error || '上传失败');
        }
      } catch (error) {
        console.error('上传失败:', error);
        this.currentResult.semanticText = `分析失败: ${error.message}`;
      } finally {
        this.isAnalyzing = false;
      }
    },
    async handleBatchUpload(files) {
      this.resetResults();
      this.currentResult.semanticText = `开始批量上传 ${files.length} 个视频...`;
      
      let completed = 0;
      let hasError = false;
      
      for (const file of files) {
        if (hasError) break;
        
        try {
          const data = await module2API.uploadBatch(file);
          
          if(data.status === "success") {
            completed++;
            this.currentResult.semanticText = `已完成 ${completed}/${files.length} 个视频分析...`;
            
            if (completed === files.length) {
              this.currentResult.semanticText += `\n批量分析完成`;
              this.loadHistory();
            }
          } else {
            throw new Error(data.error || '上传失败');
          }
        } catch (error) {
          console.error('上传失败:', error);
          hasError = true;
          this.currentResult.semanticText = `分析失败: ${file.name} - ${error.message}`;
        }
      }
    },
    getVideoUrl(videoName) {
      return module2API.getExampleVideoUrl(videoName);
    },
    analyzeExample(videoName) {
      this.handleExampleVideo(videoName);
    },
    async handleExampleVideo(videoName) {
      this.isAnalyzing = true;
      this.resetResults();
      this.currentResult.semanticText = '正在准备示例视频分析...';
      
      try {
        const videoPath = module2API.getExampleVideoUrl(videoName);
        const response = await fetch(videoPath);
        if (!response.ok) throw new Error('无法加载示例视频');
        
        const blob = await response.blob();
        const file = new File([blob], videoName, { type: blob.type });
        
        this.currentResult.videoName = videoName;
        this.currentResult.semanticText = `正在分析示例视频: ${videoName}...`;
        await this.handleFileUpload(file, true);
        
      } catch (error) {
        console.error('示例视频处理失败:', error);
        this.currentResult.semanticText = `示例视频分析失败: ${error.message}`;
      } finally {
        this.isAnalyzing = false;
      }
    }
  }
};
</script>

<style>
/* 统一布局系统 */
.page-layout {
  display: flex;
  width: 100%;
  min-height: calc(100vh - 70px);
}

.layout-sidebar {
  flex: 0 0 240px;
  background: rgb(227, 236, 250);
}

.layout-main {
  flex: 1;
  padding: 20px;
  background: #f5f7fa;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .layout-sidebar {
    flex: 0 0 200px;
  }
}

@media (max-width: 768px) {
  .page-layout {
    flex-direction: column;
  }
  
  .layout-sidebar {
    flex: 0 0 auto;
    width: 100%;
  }
  
  .layout-main {
    padding: 15px;
  }
}

@media (max-width: 576px) {
  .layout-main {
    padding: 10px;
  }
}

/* Global Styles */
body {
  font-family: 'Arial', sans-serif;
  background: #f5f7fa;
  margin: 0;
  padding: 0;
  color: #333;
}

html, body {
  width: 100%;
  height: 100%;
}

/* Main Content */
.content-legacy {
  flex: 1;
  padding: 30px;
  background: #f5f7fa;
  /* 移除 overflow-y: auto */
}

.content-area {
  padding: 40px;
  width: 100%;
  height: 100%;
  background: white;
  border-radius: 10px;
  margin: 20px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
  /* 移除 overflow-y: auto，使用页面级滚动 */
}

.content-area h2 {
  color: #0056b3;
  margin-bottom: 20px;
  font-size: 2em;
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 10px;
}

.content-area p {
  color: #666;
  font-size: 1.1em;
  line-height: 1.6;
}

.task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  width: 100%;
}

.task-header .d-flex {
  width: 100%;
  justify-content: space-between;
}

/* Feature Items */
.feature-overview {
  display: grid;
  gap: 30px;
  margin-top: 30px;
}

.feature-item {
  background: white;
  padding: 25px;
  border-radius: 10px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  transition: transform 0.3s ease;
}

.feature-item:hover {
  transform: translateY(-5px);
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
}

.feature-item h4 {
  color: #0056b3;
  margin-bottom: 15px;
  font-size: 1.3em;
}

.feature-item p {
  color: #666;
  line-height: 1.6;
  margin-bottom: 15px;
}

/* Buttons */
.btn-primary {
  background: #3b87d8;
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 5px;
  cursor: pointer;
}

.btn-primary:hover {
  background: #4875b0;
}

/* Task Table */
.task-table-wrapper {
  max-height: 600px;
  overflow-y: auto;
  border: 1px solid #ddd;
  max-height: calc(100vh - 300px);
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  position: sticky;
  top: 0;
  background: #f1f1f1;
  z-index: 10;
}

th, td {
  padding: 16px;
  text-align: center;
  vertical-align: middle;
  font-size: 18px;
}

.task-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.task-actions button {
  font-size: 16px;
  padding: 10px 16px;
  border: none;
  cursor: pointer;
  border-radius: 8px;
  margin: 5px;
  transition: 0.3s;
}

.btn-view {
  background: #5e9dc8;
  color: white;
}

.btn-view:hover {
  background: #4c87b0;
}

.btn-delete {
  background: #d27b85;
  color: white;
}

.btn-delete:hover {
  background: #b86470;
}

/* Spinner Animation */
.spinner-border {
  display: inline-block;
  width: 2rem;
  height: 2rem;
  vertical-align: text-bottom;
  border: 0.25em solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spinner-border .75s linear infinite;
}

@keyframes spinner-border {
  to { transform: rotate(360deg); }
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
