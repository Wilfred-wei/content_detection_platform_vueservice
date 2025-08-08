<template>
  <div class="container-fluid">
    <div class="row d-flex flex-nowrap">
      <!-- Sidebar - 完全保留 -->
      <Sidebar />
      
      <!-- Main Content Area - 完全保留 -->
      <main class="content col-10">
        <div class="content-area">
          <!-- 页面标题和描述 - 完全保留 -->
          <h2>视频语义理解</h2>
          <div style="margin-bottom: 20px; color: #666; font-size: 1.1em; line-height: 1.6;">
            基于先进AI技术的视频内容语义理解系统，对上传视频进行分析并给出其简要概括。
          </div>
          
          <!-- 上传和结果区域 - 完全保留 -->
          <div style="display: flex; flex-direction: column; gap: 20px;">
            <!-- 上传区域 - 完全保留 -->
            <div style="display: flex; gap: 20px;">
              <!-- 左侧上传区域 - 完全保留 -->
              <div style="flex: 1; display: flex; flex-direction: column; gap: 20px; padding: 10px; box-sizing: border-box;">
                <!-- 单视频上传 - 完全保留 -->
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
                
                <!-- 多视频上传 - 完全保留 -->
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
            
              <!-- 右侧结果区域 - 完全保留 -->
              <div style="flex: 1.5; display: flex; flex-direction: column; gap: 20px;">
                <!-- 语义分析结果展示 - 完全保留 -->
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
                
                <!-- 最近记录展示 - 完全保留 -->
                <div class="feature-item" style="margin: 0; flex: 1; display: flex; flex-direction: column;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h4 style="margin: 0;">最近3次分析记录</h4>
                    <button class="btn-primary" style="padding: 3px 8px; font-size: 0.85em;" @click="showHistoryModal">更多</button>
                  </div>
                  <div style="height: calc(100% - 40px); overflow-y: auto;">
                    <div v-if="historyData.length === 0" style="text-align: center; color: #666; height: 100%; display: flex; justify-content: center; align-items: center;">
                      <p>暂无分析记录</p>
                    </div>
                    <div v-else class="compact-records">
                      <div v-for="(record, index) in recentRecords" :key="index" 
                           class="compact-record-item"
                           :class="{ 'last-record': index === recentRecords.length - 1 }"
                           @click="showDetailModal(record.id)">
                        <div class="compact-record-header">
                          <span class="compact-filename" :title="record.filename">{{ record.filename }}</span>
                          <span class="compact-date">{{ formatCompactDate(record.date) }}</span>
                        </div>
                        <div class="compact-semantic-preview" :title="record.semantic_text">
                          {{ truncateText(record.semantic_text, 60) }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 示例视频分析区域 - 完全保留 -->
            <div class="content-area">
              <h2>示例视频分析</h2>
              
              <div class="feature-overview" style="grid-template-columns: repeat(3, 1fr);">
                <!-- 示例视频1 - 完全保留 -->
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
                
                <!-- 示例视频2 - 完全保留 -->
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
                
                <!-- 示例视频3 - 完全保留 -->
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
  </div>

  <!-- 历史记录模态框 - 完整保留 -->
  <div class="modal fade" id="historyModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-xl">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">历史分析记录</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <!-- 搜索和排序功能 - 完全保留 -->
          <div style="display: flex; justify-content: space-between; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; gap: 10px; align-items: center;">
              <input type="text" id="searchInput" class="form-control" placeholder="输入搜索内容" v-model="searchQuery" style="min-width: 200px;">
              <button class="btn-primary" @click="searchHistory">搜索</button>
              <button class="btn btn-secondary" @click="resetSearch">重置</button>
            </div>
            
            <div style="display: flex; gap: 10px; align-items: center;">
              <span>排序方式：</span>
              <select class="form-select" v-model="sortBy" style="width: 120px;">
                <option value="date">按时间</option>
                <option value="name">按名称</option>
              </select>
              <select class="form-select" v-model="sortOrder" style="width: 100px;">
                <option value="desc">降序</option>
                <option value="asc">升序</option>
              </select>
            </div>
          </div>
          
          <!-- 表格区域 - 完全保留 -->
          <div class="task-table-wrapper">
            <table class="history-table">
              <thead>
                <tr>
                  <th>序号</th>
                  <th>提交时间</th>
                  <th>视频名称</th>
                  <th>语义内容预览</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody id="historyTableBody">
                <tr v-for="(item, index) in paginatedHistory" :key="item.id">
                  <td>{{ (currentPage - 1) * pageSize + index + 1 }}</td>
                  <td>{{ item.date }}</td>
                  <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">{{ item.filename }}</td>
                  <td style="max-width: 300px;" :title="item.semantic_text">{{ truncateText(item.semantic_text, 50) }}</td>
                  <td class="task-actions">
                    <button class="btn-view" @click="showDetailModal(item.id)">查看</button>
                    <button class="btn-delete" @click="deleteRecord(item.id)">删除</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 分页控件 - 仅修改此处 -->
          <div class="pagination-container" v-if="totalPages > 1">
            <nav aria-label="Page navigation">
              <ul class="pagination">
                <li class="page-item" :class="{ disabled: currentPage === 1 }">
                  <a class="page-link" href="#" aria-label="Previous" @click.prevent="goToPage(currentPage - 1)">
                    <span aria-hidden="true">&laquo;</span>
                  </a>
                </li>
                <li class="page-item" v-for="page in visiblePages" :key="page" 
                    :class="{ active: page === currentPage }">
                  <a class="page-link" href="#" @click.prevent="goToPage(page)">{{ page }}</a>
                </li>
                <li class="page-item" :class="{ disabled: currentPage === totalPages }">
                  <a class="page-link" href="#" aria-label="Next" @click.prevent="goToPage(currentPage + 1)">
                    <span aria-hidden="true">&raquo;</span>
                  </a>
                </li>
              </ul>
            </nav>
            <div class="page-info">
              显示 {{ (currentPage - 1) * pageSize + 1 }}-{{ Math.min(currentPage * pageSize, sortedHistory.length) }} 条，共 {{ sortedHistory.length }} 条记录
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-danger" @click="deleteAllRecords">一键删除</button>
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 历史详情模态框 - 完全保留 -->
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
      isAnalyzing: false,
      historyModal: null,
      detailModal: null,
      // 分页相关数据 - 仅修改此处
      currentPage: 1,
      pageSize: 10,
      sortBy: 'date',
      sortOrder: 'desc',
      maxVisiblePages: 5
    };
  },
  computed: {
    // 排序后的历史记录 - 完全保留
    sortedHistory() {
      let data = [...this.historyData];
      if (this.searchQuery) {
        const query = this.searchQuery.toLowerCase();
        data = data.filter(item => 
          item.filename.toLowerCase().includes(query) ||
          item.date.includes(query) ||
          (item.semantic_text && item.semantic_text.toLowerCase().includes(query))
        );
      }
      
      return data.sort((a, b) => {
        let compareA, compareB;
        
        if (this.sortBy === 'date') {
          compareA = new Date(a.date);
          compareB = new Date(b.date);
        } else {
          compareA = a.filename.toLowerCase();
          compareB = b.filename.toLowerCase();
        }
        
        if (this.sortOrder === 'asc') {
          return compareA > compareB ? 1 : -1;
        } else {
          return compareA < compareB ? 1 : -1;
        }
      });
    },
    
    // 分页后的历史记录 - 仅修改此处
    paginatedHistory() {
      const start = (this.currentPage - 1) * this.pageSize;
      const end = start + this.pageSize;
      // 添加边界检查
      if (start >= this.sortedHistory.length) {
        this.currentPage = Math.max(1, Math.ceil(this.sortedHistory.length / this.pageSize));
        return [];
      }
      return this.sortedHistory.slice(start, end);
    },
    
    // 总页数 - 仅修改此处
    totalPages() {
      return Math.max(1, Math.ceil(this.sortedHistory.length / this.pageSize));
    },
    
    // 可见的分页按钮 - 仅修改此处
    visiblePages() {
      const pages = [];
      const half = Math.floor(this.maxVisiblePages / 2);
      let startPage = Math.max(1, this.currentPage - half);
      let endPage = Math.min(this.totalPages, startPage + this.maxVisiblePages - 1);
      
      // 调整起始页确保显示足够页码
      if (endPage - startPage + 1 < this.maxVisiblePages) {
        startPage = Math.max(1, endPage - this.maxVisiblePages + 1);
      }
      
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
      
      return pages;
    },
    
    // 获取最近的3条记录 - 完全保留
    recentRecords() {
      return this.historyData.slice().reverse().slice(0, 3);
    }
  },
  watch: {
    // 当排序方式或搜索条件变化时，重置到第一页 - 完全保留
    sortBy() {
      this.currentPage = 1;
    },
    sortOrder() {
      this.currentPage = 1;
    },
    searchQuery() {
      this.currentPage = 1;
    }
  },
  mounted() {
    this.historyModal = new Modal(document.getElementById('historyModal'));
    this.detailModal = new Modal(document.getElementById('historyDetailModal'));
    this.loadHistory();
  },
  methods: {
    // 新增分页跳转方法 - 仅修改此处
    goToPage(page) {
      page = parseInt(page);
      const validPage = Math.max(1, Math.min(page, this.totalPages));
      if (validPage !== this.currentPage) {
        this.currentPage = validPage;
        // 滚动到表格顶部
        const modalBody = document.querySelector('#historyModal .modal-body');
        if (modalBody) {
          modalBody.scrollTop = 0;
        }
      }
    },
    
    // 格式化日期为紧凑格式 - 完全保留
    formatCompactDate(dateString) {
      if (!dateString) return '';
      const date = new Date(dateString);
      return `${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    },
    
    // 截断文本 - 完全保留
    truncateText(text, maxLength) {
      if (!text) return '--';
      if (text.length <= maxLength) return text;
      return text.substring(0, maxLength) + '...';
    },
    
    // 重置结果 - 完全保留
    resetResults() {
      this.currentResult = {
        semanticText: '',
        videoName: '',
        analysisDate: ''
      };
    },

    // 加载历史记录 - 完全保留
    async loadHistory() {
      try {
        const data = await module2API.getHistory();
        this.historyData = data;
      } catch (error) {
        console.error('加载历史记录失败:', error);
      }
    },
    
    // 显示历史模态框 - 完全保留
    showHistoryModal() {
      this.historyModal.show();
    },
    
    // 显示详情模态框 - 完全保留
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
    
    // 删除记录 - 完全保留
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
    
    // 删除所有记录 - 完全保留
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
    
    // 搜索历史 - 仅修改此处（添加分页重置）
    searchHistory() {
      this.currentPage = 1;
    },
    
    // 重置搜索 - 仅修改此处（添加分页重置）
    resetSearch() {
      this.searchQuery = '';
      this.currentPage = 1;
    },
    
    // 单文件上传 - 完全保留
    handleSingleUpload(event) {
      if (event.target.files.length > 0) {
        this.handleFileUpload(event.target.files[0], true);
      }
    },
    
    // 多文件上传 - 完全保留
    handleMultiUpload(event) {
      if (event.target.files.length > 0) {
        this.handleBatchUpload(event.target.files);
      }
    },
    
    // 文件上传处理 - 完全保留
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
    
    // 批量上传处理 - 完全保留
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
    
    // 获取视频URL - 完全保留
    getVideoUrl(videoName) {
      return module2API.getExampleVideoUrl(videoName);
    },
    
    // 分析示例 - 完全保留
    analyzeExample(videoName) {
      this.handleExampleVideo(videoName);
    },
    
    // 处理示例视频 - 完全保留
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
/* 全局样式 - 完全保留 */
body {
  font-family: 'Arial', sans-serif;
  background: #f5f7fa;
  margin: 0;
  padding: 0;
  color: #333;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: auto;
}

/* 主要内容区域 - 完全保留 */
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

.content-area p {
  color: #666;
  font-size: 1.1em;
  line-height: 1.6;
}

/* 功能项样式 - 完全保留 */
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

/* 按钮样式 - 完全保留 */
.btn-primary {
  background: #3b87d8;
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.3s;
}

.btn-primary:hover {
  background: #2a6fc9;
}

/* 紧凑记录样式 - 完全保留 */
.compact-records {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.compact-record-item {
  padding: 8px;
  border-radius: 6px;
  background-color: #f9f9f9;
  cursor: pointer;
  transition: background-color 0.2s;
}

.compact-record-item:hover {
  background-color: #f0f0f0;
}

.compact-record-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.compact-filename {
  font-weight: bold;
  font-size: 0.9em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 70%;
}

.compact-date {
  font-size: 0.8em;
  color: #888;
}

.compact-semantic-preview {
  font-size: 0.85em;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 任务表格样式 - 完全保留 */
.task-table-wrapper {
  max-height: 600px;
  overflow-y: auto;
  border: 1px solid #ddd;
  border-radius: 5px;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
}

.history-table th, 
.history-table td {
  padding: 12px 15px;
  text-align: left;
  border-bottom: 1px solid #eee;
  word-wrap: break-word;
}

.history-table th {
  background-color: #f8f9fa;
  font-weight: 600;
  color: #495057;
  position: sticky;
  top: 0;
  z-index: 10;
}

.history-table tr:hover {
  background-color: #f8f9fa;
}

.task-actions {
  display: flex;
  gap: 8px;
}

.task-actions button {
  padding: 5px 10px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85em;
}

.btn-view {
  background: #28a745;
  color: white;
}

.btn-delete {
  background: #dc3545;
  color: white;
}

/* 旋转动画 - 完全保留 */
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

/* 分页样式 - 完全保留 */
.pagination-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  padding: 10px 0;
}

.pagination {
  margin: 0;
}

.page-item.active .page-link {
  background-color: #3b87d8;
  border-color: #3b87d8;
}

.page-link {
  color: #3b87d8;
}

.page-info {
  color: #666;
  font-size: 0.9em;
}

/* 表格列宽调整 - 完全保留 */
.history-table th:nth-child(1),
.history-table td:nth-child(1) {
  width: 8%;
}

.history-table th:nth-child(2),
.history-table td:nth-child(2) {
  width: 20%;
}

.history-table th:nth-child(3),
.history-table td:nth-child(3) {
  width: 25%;
}

.history-table th:nth-child(4),
.history-table td:nth-child(4) {
  width: 35%;
}

.history-table th:nth-child(5),
.history-table td:nth-child(5) {
  width: 12%;
}

/* 响应式调整 - 完全保留 */
@media (max-width: 1200px) {
  .history-table th:nth-child(4),
  .history-table td:nth-child(4) {
    width: 30%;
  }
}

@media (max-width: 992px) {
  .feature-overview {
    grid-template-columns: repeat(2, 1fr) !important;
  }
  
  .history-table th:nth-child(2),
  .history-table td:nth-child(2) {
    width: 25%;
  }
  
  .history-table th:nth-child(4),
  .history-table td:nth-child(4) {
    display: none;
  }
}

@media (max-width: 768px) {
  .feature-overview {
    grid-template-columns: 1fr !important;
  }
  
  .content-area {
    padding: 20px;
  }
  
  .history-table th:nth-child(1),
  .history-table td:nth-child(1) {
    width: 10%;
  }
  
  .history-table th:nth-child(2),
  .history-table td:nth-child(2) {
    width: 30%;
  }
  
  .history-table th:nth-child(3),
  .history-table td:nth-child(3) {
    width: 40%;
  }
  
  .history-table th:nth-child(5),
  .history-table td:nth-child(5) {
    width: 20%;
  }
  
  .pagination-container {
    flex-direction: column;
    gap: 10px;
  }
  
  .compact-record-header {
    flex-direction: column;
  }
  
  .compact-filename {
    max-width: 100%;
    margin-bottom: 2px;
  }
  
  .compact-date {
    align-self: flex-end;
  }
}
</style>
