<template>
  <div class="page-layout">
    <aside class="layout-sidebar">
      <Sidebar />
    </aside>
    
    <main class="layout-main">
      <div class="content-area">
        <h2>有害视频分类数据集</h2>
        <div class="description-text">
          查看已分析的有害视频分类数据，包含置信度、危害类别、来源和发布者信息。
        </div>
        
        <!-- 搜索和排序功能区 -->
        <div class="filter-controls">
          <div class="search-group">
            <input 
              type="text" 
              class="form-control search-input" 
              placeholder="搜索视频名称、类别或来源" 
              v-model="searchQuery"
            >
            <button class="btn btn-primary btn-sm action-btn" @click="searchHistory">搜索</button>
            <button class="btn btn-secondary btn-sm action-btn" @click="resetSearch">重置</button>
          </div>
          
          <div class="sort-filter-group">
            <span class="sort-label">排序方式：</span>
            <select class="form-select form-select-sm" v-model="sortBy">
              <option value="date">按时间</option>
              <option value="name">按名称</option>
              <option value="score">按置信度</option>
              <option value="source">按来源</option>
            </select>
            
            <select class="form-select form-select-sm" v-model="sortOrder">
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
            
            <select class="form-select form-select-sm" v-model="categoryFilter">
              <option value="">所有类别</option>
              <option v-for="category in availableCategories" 
                      :value="category" 
                      :key="category">
                {{ category }}
              </option>
            </select>

            <select class="form-select form-select-sm" v-model="sourceFilter">
              <option value="">所有来源</option>
              <option v-for="source in availableSources" 
                      :value="source" 
                      :key="source">
                {{ source }}
              </option>
            </select>
          </div>
        </div>
        
        <!-- 表格区域 -->
        <div class="task-table-wrapper">
          <table class="history-table">
            <thead>
              <tr>
                <th style="width: 60px;">序号</th>
                <th style="width: 120px;">检测时间</th>
                <th style="min-width: 150px;">视频名称</th>
                <th style="width: 100px;">置信度</th>
                <th style="width: 120px;">危害类别</th>
                <th style="width: 120px;">来源</th>
                <th style="width: 120px;">发布者</th>
                <th style="width: 200px;">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in paginatedHistory" :key="item.id">
                <td>{{ (currentPage - 1) * pageSize + index + 1 }}</td>
                <td>{{ formatDate(item.date) }}</td>
                <td class="filename-cell">{{ item.filename || '--' }}</td>
                <td class="score-cell">{{ item.score }}%</td>
                <td class="category-cell">{{ item.category || '--' }}</td>
                <td class="source-cell">{{ item.source || '--' }}</td>
                <td class="author-cell">{{ item.author || '--' }}</td>
                <td class="task-actions">
                  <button class="btn-view" @click="showDetailModal(item.id)">查看</button>
                  <button class="btn-play" @click="playVideo(item.file_path)">播放</button>
                  <button class="btn-delete" @click="deleteRecord(item.id)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pagination-container" v-if="totalPages > 1">
          <nav aria-label="Page navigation">
            <ul class="pagination">
              <li class="page-item" :class="{ disabled: currentPage === 1 }">
                <a class="page-link" href="#" aria-label="Previous" @click.prevent="goToPage(currentPage - 1)">
                  <span aria-hidden="true">&laquo;</span>
                </a>
              </li>
              <li 
                class="page-item" 
                v-for="page in visiblePages" 
                :key="page" 
                :class="{ active: page === currentPage }"
              >
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
          <!-- 新增的页码跳转输入框 -->
          <div class="page-jump">
            <span>跳转到:</span>
            <input 
              type="number" 
              min="1" 
              :max="totalPages" 
              v-model.number="jumpPage" 
              @keyup.enter="jumpToPage"
              class="page-jump-input"
            >
            <button @click="jumpToPage" class="btn btn-primary btn-sm page-jump-btn">确定</button>
          </div>
        </div>
      </div>
    </main>

    <!-- 历史详情模态框  -->
    <div class="modal fade" id="historyDetailModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">检测结果详情</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body modal-body-center">
            <div class="detail-score-container">
              <div class="detail-score">
                置信度: <span>{{ detailScore }}%</span>
              </div>
              <div class="detail-progress">
                <div class="progress-bar" :style="{ width: detailScore + '%' }"></div>
              </div>
            </div>
            
            <div class="detail-info-grid">
              <div class="detail-info-item">
                <span class="detail-label">潜在危害类别:</span>
                <span class="detail-value">{{ detailCategory || '--' }}</span>
              </div>
              <div class="detail-info-item">
                <span class="detail-label">来源:</span>
                <span class="detail-value">{{ detailSource || '--' }}</span>
              </div>
              <div class="detail-info-item">
                <span class="detail-label">发布者:</span>
                <span class="detail-value">{{ detailAuthor || '--' }}</span>
              </div>
            </div>
            
            <div class="detail-video-name">
              <span class="detail-label">视频名称:</span>
              <span>{{ detailVideoName }}</span>
            </div>
            
            <div class="detail-timestamp">
              <span class="detail-label">检测时间:</span>
              <span>{{ detailTimestamp }}</span>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 视频播放模态框 -->
    <div class="modal fade" id="videoPlayerModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">视频播放</h5>
            <button type="button" class="btn-close" @click="closeVideoPlayer" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="video-container">
              <video controls autoplay class="video-player" ref="videoPlayer">
                <source :src="getVideoSource(currentVideoUrl)" type="video/mp4">
                您的浏览器不支持视频播放
              </video>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="closeVideoPlayer">关闭</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { Modal } from 'bootstrap';
import Sidebar from '../components/Sidebar.vue';
import { module3API } from '../api';

export default {
  name: 'VideoCredibilityHistoryModule3',
  components: {
    Sidebar
  },
  data() {
    return {
      historyData: [],
      searchQuery: '',
      detailScore: '--',
      detailCategory: '',
      detailSource: '',
      detailAuthor: '',
      detailVideoName: '',
      detailTimestamp: '',
      detailModal: null,
      videoPlayerModal: null,
      currentVideoUrl: '',
      currentPage: 1,
      pageSize: 10,
      sortBy: 'date',
      sortOrder: 'desc',
      maxVisiblePages: 5,
      categoryFilter: '',
      sourceFilter: '',
      availableCategories: [
        '无',
        '恶意引流',
        '违法犯罪',
        '未成年不良',
        '破坏社会稳定',
        '色情低俗',
        '血腥暴力',
        '赌博诈骗',
        '违规营销'
      ],
      availableSources: [],
      jumpPage: 1 // 新增的跳转页码变量
    };
  },
  computed: {
    sortedHistory() {
      let data = [...this.historyData];
      
      if (this.categoryFilter) {
        data = data.filter(item => item.category === this.categoryFilter);
      }
      
      if (this.sourceFilter) {
        data = data.filter(item => item.source === this.sourceFilter);
      }
      
      if (this.searchQuery) {
        const query = this.searchQuery.toLowerCase();
        data = data.filter(item => 
          (item.filename && item.filename.toLowerCase().includes(query)) ||
          (item.category && item.category.toLowerCase().includes(query)) ||
          (item.source && item.source.toLowerCase().includes(query))
        );
      }
      
      return data.sort((a, b) => {
        let compareA, compareB;
        
        if (this.sortBy === 'date') {
          compareA = new Date(a.date);
          compareB = new Date(b.date);
        } else if (this.sortBy === 'name') {
          compareA = a.filename?.toLowerCase() || '';
          compareB = b.filename?.toLowerCase() || '';
        } else if (this.sortBy === 'score') {
          compareA = parseInt(a.score) || 0;
          compareB = parseInt(b.score) || 0;
        } else {
          compareA = a.source?.toLowerCase() || '';
          compareB = b.source?.toLowerCase() || '';
        }
        
        return this.sortOrder === 'asc' 
          ? (compareA > compareB ? 1 : -1)
          : (compareA < compareB ? 1 : -1);
      });
    },
    
    paginatedHistory() {
      const start = (this.currentPage - 1) * this.pageSize;
      const end = start + this.pageSize;
      return this.sortedHistory.slice(start, end);
    },
    
    totalPages() {
      return Math.ceil(this.sortedHistory.length / this.pageSize);
    },
    
    visiblePages() {
      const pages = [];
      let startPage = Math.max(1, this.currentPage - Math.floor(this.maxVisiblePages / 2));
      let endPage = Math.min(this.totalPages, startPage + this.maxVisiblePages - 1);
      
      if (endPage - startPage + 1 < this.maxVisiblePages) {
        startPage = Math.max(1, endPage - this.maxVisiblePages + 1);
      }
      
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
      
      return pages;
    }
  },
  watch: {
    sortBy() { this.currentPage = 1; },
    sortOrder() { this.currentPage = 1; },
    searchQuery() { this.currentPage = 1; },
    categoryFilter() { this.currentPage = 1; },
    sourceFilter() { this.currentPage = 1; }
  },
  mounted() {
    this.detailModal = new Modal(document.getElementById('historyDetailModal'));
    this.videoPlayerModal = new Modal(document.getElementById('videoPlayerModal'));
    
    document.getElementById('videoPlayerModal').addEventListener('hidden.bs.modal', () => {
      this.pauseVideo();
    });
    
    this.loadHistory();
  },
  methods: {
    extractFilename(filePath) {
      return filePath ? filePath.replace(/^.*[\\\/]/, '') : '--';
    },

    getVideoSource(rawPath) {
      if (!rawPath) return '';
      if (rawPath.startsWith('http') || rawPath.startsWith('/static')) {
        return rawPath;
      }
      const filename = encodeURIComponent(this.extractFilename(rawPath));
      return `/video-proxy/module3/${filename}`;
    },

    pauseVideo() {
      const player = this.$refs.videoPlayer;
      if (player) {
        player.pause();
      }
    },

    closeVideoPlayer() {
      this.pauseVideo();
      this.videoPlayerModal.hide();
    },

    async loadHistory() {
      try {
        const data = await module3API.getHistory();
        this.historyData = data.map(item => ({
          ...item,
          filename: item.filename || this.extractFilename(item.file_path)
        }));
        this.updateAvailableCategories();
        this.updateAvailableSources();
      } catch (error) {
        console.error('加载历史记录失败:', error);
        alert('加载历史记录失败: ' + error.message);
      }
    },

    updateAvailableCategories() {
      const categories = new Set();
      this.historyData.forEach(item => {
        if (item.category) categories.add(item.category);
      });
      this.availableCategories = Array.from(categories);
    },

    updateAvailableSources() {
      const sources = new Set();
      this.historyData.forEach(item => {
        if (item.source) sources.add(item.source);
      });
      this.availableSources = Array.from(sources);
    },

    async showDetailModal(id) {
      try {
        const response = await module3API.getHistoryDetail(id);
        if (response.error) {
          alert(response.error);
          return;
        }

        const record = response.result;
        if (!record) {
          alert('未获取到记录数据');
          return;
        }

        this.detailScore = record.score;
        this.detailCategory = record.category || '';
        this.detailSource = record.source || '';
        this.detailAuthor = record.author || '';
        this.detailVideoName = record.filename || this.extractFilename(record.file_path);
        
        this.detailTimestamp = record.date;
        this.detailModal.show();
      } catch (error) {
        console.error('获取详情失败:', error);
        alert('获取详情失败: ' + error.message);
      }
    },

    playVideo(rawPath) {
      if (!rawPath) {
        alert('无法获取视频路径');
        return;
      }
      
      this.currentVideoUrl = rawPath;
      this.$nextTick(() => {
        this.videoPlayerModal.show();
        const player = this.$refs.videoPlayer;
        player.load();
        player.play().catch(e => {
          console.error('视频播放失败:', e);
          alert('视频播放失败，请检查视频路径');
        });
      });
    },

    async deleteRecord(id) {
      if (confirm('确定删除这条记录吗？')) {
        try {
          const data = await module3API.deleteHistory(id);
          if (data.status === "success") this.loadHistory();
        } catch (error) {
          console.error('删除失败:', error);
          alert('删除失败，请稍后重试');
        }
      }
    },

    goToPage(page) {
      if (page >= 1 && page <= this.totalPages) {
        this.currentPage = page;
      }
    },
    
    // 新增的跳转到指定页码方法
    jumpToPage() {
      if (this.jumpPage >= 1 && this.jumpPage <= this.totalPages) {
        this.currentPage = this.jumpPage;
      } else {
        // 如果输入的页码超出范围，重置为当前页
        this.jumpPage = this.currentPage;
      }
    },
    
    formatDate(dateString) {
      if (!dateString) return '';
      const date = new Date(dateString);
      return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    },
    
    getResultClass(score) {
      if (score > 70) return 'high-confidence';
      if (score > 30) return 'medium-confidence';
      return 'low-confidence';
    },
    
    searchHistory() {},
    resetSearch() {
      this.searchQuery = '';
      this.categoryFilter = '';
      this.sourceFilter = '';
    }
  }
};
</script>

<style>
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

.content-area {
  padding: 30px;
  width: 100%;
  height: 100%;
  background: white;
  border-radius: 10px;
  margin: 20px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
}

.content-area h2 {
  color: #0056b3;
  margin-bottom: 15px;
  font-size: 1.8em;
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 10px;
}

.description-text {
  margin-bottom: 20px; 
  color: #666;
  font-size: 1em;
  line-height: 1.6;
}

.filter-controls {
  display: flex;
  justify-content: space-between;
  margin-bottom: 15px;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.search-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-input {
  min-width: 500px;
  height: 32px;
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #ced4da;
  border-radius: 0.25rem;
}

.action-btn {
  height: 32px;
  padding: 0 12px;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  border-radius: 0.25rem;
  cursor: pointer;
}

.btn-primary {
  color: #fff;
  background-color: #0d6efd;
  border-color: #0d6efd;
}

.btn-secondary {
  color: #fff;
  background-color: #6c757d;
  border-color: #6c757d;
}

.sort-filter-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

.sort-label {
  white-space: nowrap;
  font-size: 0.875rem;
  color: #495057;
}

.form-select-sm {
  height: 32px;
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
  border-radius: 0.25rem;
  border: 1px solid #ced4da;
}

.task-table-wrapper {
  width: 100%;
  overflow-x: auto;
  border: 1px solid #ddd;
  border-radius: 5px;
  margin-bottom: 20px;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
  table-layout: fixed;
}

.history-table th, 
.history-table td {
  padding: 10px 12px;
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
}

.filename-cell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.score-cell {
  font-weight: 500;
  color: #0056b3;
  text-align: center;
}

.category-cell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-cell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.author-cell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-actions {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
}

.btn-view {
  background: #28a745;
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85em;
  transition: background 0.2s;
  white-space: nowrap;
}

.btn-play {
  background: #3b87d8;
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85em;
  transition: background 0.2s;
  white-space: nowrap;
}

.btn-delete {
  background: #dc3545;
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85em;
  transition: background 0.2s;
  white-space: nowrap;
}

.btn-view:hover { background: #218838; }
.btn-play:hover { background: #2c6db5; }
.btn-delete:hover { background: #c82333; }

.pagination-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  padding: 10px 0;
}

.pagination {
  display: flex;
  padding-left: 0;
  list-style: none;
  margin: 0;
}

.page-item {
  margin: 0 2px;
}

.page-link {
  position: relative;
  display: block;
  padding: 0.375rem 0.75rem;
  color: #3b87d8;
  text-decoration: none;
  background-color: #fff;
  border: 1px solid #dee2e6;
  border-radius: 0.25rem;
  transition: all 0.2s;
}

.page-item.active .page-link {
  z-index: 3;
  color: #fff;
  background-color: #3b87d8;
  border-color: #3b87d8;
}

.page-item.disabled .page-link {
  color: #6c757d;
  pointer-events: none;
  background-color: #fff;
  border-color: #dee2e6;
}

.page-link:hover {
  z-index: 2;
  color: #2a6db0;
  background-color: #e9ecef;
  border-color: #dee2e6;
}

.page-info {
  color: #666;
  font-size: 0.9em;
}

/* 新增的页码跳转样式 */
.page-jump {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-jump span {
  font-size: 0.9rem;
  color: #666;
}

.page-jump-input {
  width: 60px;
  padding: 5px;
  border: 1px solid #ddd;
  border-radius: 4px;
  text-align: center;
}

.page-jump-btn {
  padding: 5px 10px;
}

.modal-content {
  border: none;
  border-radius: 0.5rem;
  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
}

.modal-header {
  border-bottom: 1px solid #dee2e6;
  padding: 1rem 1.5rem;
}

.modal-title {
  margin: 0;
  font-size: 1.25rem;
  color: #212529;
}

.modal-body-center {
  text-align: center;
  padding: 2rem;
}

/* 美化后的详情模态框样式 */
.detail-score-container {
  margin-bottom: 20px;
}

.detail-score {
  font-size: 24px;
  font-weight: bold;
  color: #0056b3;
  margin-bottom: 10px;
}

.detail-progress {
  height: 10px;
  background: #eee;
  border-radius: 5px;
  margin: 0 auto;
  width: 80%;
}

.progress-bar {
  height: 100%;
  background: #3b87d8;
  border-radius: 5px;
  transition: width 0.5s ease;
}

.detail-info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 15px;
  margin: 20px 0;
  text-align: left;
  padding: 0 20px;
}

.detail-info-item {
  display: flex;
  align-items: center;
}

.detail-label {
  font-weight: bold;
  color: #495057;
  margin-right: 8px;
  min-width: 80px;
}

.detail-value {
  color: #212529;
}

.detail-video-name {
  margin: 15px 0;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-result-container {
  margin: 20px 0;
  padding: 15px;
  border-radius: 5px;
  font-size: 1.1em;
}

.detail-result-container.high-confidence {
  background-color: #d4edda;
  color: #155724;
}

.detail-result-container.medium-confidence {
  background-color: #fff3cd;
  color: #856404;
}

.detail-result-container.low-confidence {
  background-color: #f8d7da;
  color: #721c24;
}

.detail-result-text {
  font-weight: 500;
}

.detail-timestamp {
  color: #6c757d;
  font-size: 0.9em;
  margin-top: 15px;
}

/* 视频播放器样式 */
.video-container {
  width: 100%;
  height: 0;
  padding-bottom: 56.25%; /* 16:9 宽高比 */
  position: relative;
  background: #000;
  border-radius: 4px;
  overflow: hidden;
}

.video-player {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.modal-footer {
  border-top: 1px solid #dee2e6;
  padding: 1rem 1.5rem;
}

.btn-close {
  padding: 0.5rem;
  margin: -0.5rem -0.5rem -0.5rem auto;
  background-color: transparent;
  border: 0;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.btn-close:hover {
  opacity: 1;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .layout-sidebar {
    flex: 0 0 200px;
  }
  
  .content-area {
    padding: 20px;
  }
}

@media (max-width: 992px) {
  .filter-controls {
    flex-direction: column;
    align-items: stretch;
  }
  
  .search-group,
  .sort-filter-group {
    width: 100%;
  }
  
  .search-input {
    min-width: auto;
    flex: 1;
  }
  
  .modal-lg {
    max-width: 90%;
  }
  
  .history-table th:nth-child(7),
  .history-table td:nth-child(7) {
    display: none;
  }
  
  .detail-info-grid {
    grid-template-columns: 1fr;
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
  
  .content-area {
    padding: 15px;
    margin: 10px;
  }
  
  .history-table th:nth-child(5),
  .history-table td:nth-child(5),
  .history-table th:nth-child(6),
  .history-table td:nth-child(6),
  .history-table th:nth-child(7),
  .history-table td:nth-child(7) {
    display: none;
  }
  
  .task-actions {
    flex-direction: column;
    gap: 5px;
  }
  
  .btn-view, .btn-play, .btn-delete {
    width: 100%;
  }
  
  .video-container {
    padding-bottom: 75%; /* 4:3 在小屏幕上 */
  }
  
  .pagination-container {
    flex-direction: column;
    gap: 10px;
  }
  
  .page-jump {
    justify-content: center;
  }
}

@media (max-width: 576px) {
  .layout-main {
    padding: 10px;
  }
  
  .content-area {
    padding: 12px;
  }
  
  .content-area h2 {
    font-size: 1.5em;
  }
  
  .modal-dialog {
    margin: 0.5rem;
  }
  
  .modal-content {
    border-radius: 0.3rem;
  }
  
  .detail-progress {
    width: 100%;
  }
}
</style>