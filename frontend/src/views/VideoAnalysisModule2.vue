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
          <!-- 上传和结果区域 -->
          <div style="display: flex; gap: 20px;">
            <!-- 左侧上传区域 -->
            <div style="flex: 1; display: flex; flex-direction: column; gap: 20px; padding: 10px; box-sizing: border-box;">
              <!-- 单视频上传 -->
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
              
              <!-- 多视频上传 -->
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
            
            <!-- 右侧结果区域 -->
            <div style="flex: 1.5; display: flex; flex-direction: column; gap: 20px;">
              <!-- 检测结果 -->
              <div class="feature-item" style="flex: 1;">
                <h4>语义分析结果</h4>
                <div style="padding: 15px; height: 100%; display: flex; flex-direction: column; justify-content: center;">
                  <div v-if="isAnalyzing" class="analyzing-container">
                    <div class="spinner"></div>
                    <div class="analyzing-text">分析中...</div>
                  </div>
                  
                  <div v-else style="text-align: center; height: 100%; display: flex; flex-direction: column;">
                    <div style="flex: 1; overflow-y: auto; padding: 0 10px;">
                      <div v-if="currentResult.semanticText" style="text-align: left;">
                        <strong style="color: #0056b3;">分析结果：</strong>
                        <p style="white-space: pre-wrap; word-break: break-word; margin-bottom: 10px;">{{ currentResult.semanticText }}</p>
                      </div>
                      <div v-else-if="batchProgress.total > 0" class="batch-progress-container">
                        <div class="batch-progress-header">
                          <span>批量分析进度</span>
                          <span>{{ batchProgress.completed }}/{{ batchProgress.total }}</span>
                        </div>
                        <div class="batch-progress-bar">
                          <div :style="{ width: batchProgress.percent + '%' }"></div>
                        </div>
                        <div class="batch-results">
                          <div v-for="(result, index) in batchResults" :key="index" class="batch-result-item">
                            <div class="batch-filename">{{ result.filename }}</div>
                            <div class="batch-status" :class="{ 'success': result.status === 'success', 'error': result.status === 'error' }">
                              {{ result.message }}
                            </div>
                          </div>
                        </div>
                      </div>
                      <p v-else style="color: #999;">请上传视频获取语义分析结果</p>
                    </div>
                    <div id="videoMeta" style="margin-top: auto; padding: 10px; background: #f5f7fa; border-radius: 5px;">
                      <p v-if="currentResult.videoName" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 5px 0;">视频: {{ currentResult.videoName }}</p>
                      <p v-if="currentResult.analysisDate" style="color: #888; margin: 5px 0;">分析时间: {{ currentResult.analysisDate }}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- 最新记录展示区 -->
              <div class="feature-item" style="flex: 1;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                  <h4 style="margin: 0;">最近3次分析记录</h4>
                  <button class="btn-primary" style="padding: 3px 8px; font-size: 0.85em;" @click="showHistoryModal">更多</button>
                </div>
                <div style="height: calc(100% - 40px); overflow-y: auto;">
                  <div v-if="historyData.length === 0" style="text-align: center; color: #666; height: 100%; display: flex; justify-content: center; align-items: center;">
                    <p>暂无检测记录</p>
                  </div>
                  <div v-else class="compact-records">
                    <div v-for="(record, index) in recentRecords" :key="index" 
                         class="compact-record-item"
                         :class="{ 'last-record': index === recentRecords.length - 1 }">
                      <div class="compact-record-header">
                        <span class="compact-filename">{{ record.filename }}</span>
                        <span class="compact-date">{{ formatCompactDate(record.date) }}</span>
                      </div>
                      <div class="compact-semantic-preview">
                        {{ truncateText(record.semantic_text, 60) }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 示例视频分析区域 -->
          <div class="content-area">
            <h2>示例视频分析</h2>
            
            <div class="feature-overview" style="grid-template-columns: repeat(3, 1fr);">
              <div class="feature-item">
                <div style="width: 100%; height: 200px; overflow: hidden; display: flex; justify-content: center; align-items: center; background: #000;">
                  <video controls style="max-width: 100%; max-height: 100%; object-fit: contain;">
                    <source :src="getVideoUrl('example3_2_2_News.mp4')" type="video/mp4">
                  </video>
                </div>
                <h4>新闻视频示例</h4>
                <p>新闻报道视频示例，输出对新闻内容的简要概括。</p>
                <button class="btn-primary" @click="analyzeExample('example3_2_2_News.mp4')">分析此示例</button>
              </div>
              
              <div class="feature-item">
                <div style="width: 100%; height: 200px; overflow: hidden; display: flex; justify-content: center; align-items: center; background: #000;">
                  <video controls style="max-width: 100%; max-height: 100%; object-fit: contain;">
                    <source :src="getVideoUrl('example3_2_2_Life.mp4')" type="video/mp4">
                  </video>
                </div>
                <h4>生活视频示例</h4>
                <p>生活类型视频示例，输出对视频内容的简要概括。</p>
                <button class="btn-primary" @click="analyzeExample('example3_2_2_Life.mp4')">分析此示例</button>
              </div>
              
              <div class="feature-item">
                <div style="width: 100%; height: 200px; overflow: hidden; display: flex; justify-content: center; align-items: center; background: #000;">
                  <video controls style="max-width: 100%; max-height: 100%; object-fit: contain;">
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

  <!-- 历史记录模态框 - 修改后的版本 -->
  <div class="modal fade" id="historyModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-xl">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">历史分析记录</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" :disabled="isDeleting"></button>
        </div>
        <div class="modal-body">
          <!-- 搜索和排序功能区 -->
          <div class="filter-controls">
            <div class="search-group">
              <input type="text" id="searchInput" class="form-control search-input" 
                     placeholder="输入搜索内容" v-model="searchQuery" :disabled="isDeleting">
              <button class="btn btn-primary btn-sm action-btn" @click="searchHistory" :disabled="isDeleting">搜索</button>
              <button class="btn btn-secondary btn-sm action-btn" @click="resetSearch" :disabled="isDeleting">重置</button>
            </div>
            
            <div class="sort-filter-group">
              <span class="sort-label">排序方式：</span>
              <select class="form-select form-select-sm" v-model="sortBy" :disabled="isDeleting">
                <option value="date">按时间</option>
                <option value="name">按名称</option>
              </select>
              
              <select class="form-select form-select-sm" v-model="sortOrder" :disabled="isDeleting">
                <option value="desc">降序</option>
                <option value="asc">升序</option>
              </select>
            </div>
          </div>
          
          <!-- 表格区域 -->
          <div class="table-container">
            <table class="history-table">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" v-model="selectAll" @change="toggleSelectAll" :disabled="isDeleting || paginatedHistory.length === 0">
                  </th>
                  <th style="width: 60px;">序号</th>
                  <th style="width: 150px;">提交时间</th>
                  <th>视频名称</th>
                  <th style="width: 300px;">语义内容</th>
                  <th style="width: 180px;">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in paginatedHistory" :key="item.id">
                  <td>
                    <input type="checkbox" v-model="selectedItems" :value="item.id" :disabled="isDeleting">
                  </td>
                  <td>{{ (currentPage - 1) * pageSize + index + 1 }}</td>
                  <td>{{ item.date }}</td>
                  <td class="filename-cell">{{ item.filename }}</td>
                  <td>{{ truncateText(item.semantic_text, 50) }}</td>
                  <td class="actions-cell">
                    <button class="btn-view" @click="showDetailModal(item.id)" :disabled="isDeleting">查看</button>
                    <button class="btn-play" @click="playVideo(item.file_path)" :disabled="isDeleting">播放</button>
                    <button class="btn-delete" @click="deleteRecord(item.id)" :disabled="isDeleting">删除</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 分页控件 -->
          <div class="pagination-container" v-if="totalPages > 1">
            <nav aria-label="Page navigation">
              <ul class="pagination">
                <li class="page-item" :class="{ disabled: currentPage === 1 }">
                  <a class="page-link" href="#" aria-label="Previous" @click.prevent="changePage(currentPage - 1)" :disabled="isDeleting">
                    <span aria-hidden="true">&laquo;</span>
                  </a>
                </li>
                <li class="page-item" v-for="page in visiblePages" :key="page" 
                    :class="{ active: page === currentPage }">
                  <a class="page-link" href="#" @click.prevent="changePage(page)" :disabled="isDeleting">{{ page }}</a>
                </li>
                <li class="page-item" :class="{ disabled: currentPage === totalPages }">
                  <a class="page-link" href="#" aria-label="Next" @click.prevent="changePage(currentPage + 1)" :disabled="isDeleting">
                    <span aria-hidden="true">&raquo;</span>
                  </a>
                </li>
              </ul>
            </nav>
            <div class="page-info">
              显示 {{ (currentPage - 1) * pageSize + 1 }}-{{ Math.min(currentPage * pageSize, sortedHistory.length) }} 条，共 {{ sortedHistory.length }} 条记录
            </div>
            <!-- 新增的页码跳转功能 -->
            <div class="page-jump">
              <span>跳转到:</span>
              <input type="number" 
                     min="1" 
                     :max="totalPages" 
                     v-model.number="jumpPage" 
                     @keyup.enter="jumpToPage"
                     class="page-jump-input"
                     :disabled="isDeleting">
              <button @click="jumpToPage" class="btn btn-primary btn-sm page-jump-btn" :disabled="isDeleting">确定</button>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-danger" @click="deleteSelectedRecords" 
                  :disabled="selectedItems.length === 0 || isDeleting">
            <span v-if="isDeleting">
              <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
              删除中...
            </span>
            <span v-else>
              删除选中项 ({{ selectedItems.length }})
            </span>
          </button>
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" :disabled="isDeleting">关闭</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 历史详情模态框 -->
  <div class="modal fade" id="historyDetailModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">语义分析详情</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body" style="text-align: left;">
          <div style="font-weight: bold; margin-bottom: 15px; font-size: 18px;">视频: {{ currentDetail.filename }}</div>
          <div style="max-height: 400px; overflow-y: auto; padding: 15px; background: #f9f9f9; border-radius: 5px;">
            <pre style="white-space: pre-wrap; margin: 0; font-family: inherit; line-height: 1.5;">{{ currentDetail.semantic_text }}</pre>
          </div>
          <div style="color: #888; margin-top: 15px;">分析时间: {{ currentDetail.date }}</div>
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
      currentVideoUrl: '',
      isAnalyzing: false,
      historyModal: null,
      detailModal: null,
      videoPlayerModal: null,
      currentPage: 1,
      pageSize: 10,
      sortBy: 'date',
      sortOrder: 'desc',
      maxVisiblePages: 5,
      batchProgress: {
        total: 0,
        completed: 0,
        percent: 0
      },
      batchResults: [],
      jumpPage: 1,
      // 新增的状态
      selectedItems: [], // 存储选中的记录ID
      selectAll: false,  // 全选状态
      isDeleting: false, // 删除中状态
    };
  },
  computed: {
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
      const half = Math.floor(this.maxVisiblePages / 2);
      let startPage = Math.max(1, this.currentPage - half);
      let endPage = Math.min(this.totalPages, startPage + this.maxVisiblePages - 1);
      
      if (endPage - startPage + 1 < this.maxVisiblePages) {
        startPage = Math.max(1, endPage - this.maxVisiblePages + 1);
      }
      
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
      
      return pages;
    },
    
    recentRecords() {
      return this.historyData.slice().reverse().slice(0, 3);
    }
  },
  watch: {
    sortBy() {
      this.currentPage = 1;
    },
    sortOrder() {
      this.currentPage = 1;
    },
    searchQuery() {
      this.currentPage = 1;
    },
    // 新增：监听选中项变化，更新全选状态
    selectedItems(newVal) {
      this.selectAll = newVal.length === this.paginatedHistory.length && this.paginatedHistory.length > 0;
    },
    // 新增：监听分页变化，重置选中状态
    currentPage() {
      this.selectedItems = [];
      this.selectAll = false;
    }
  },
  mounted() {
    this.historyModal = new Modal(document.getElementById('historyModal'));
    this.detailModal = new Modal(document.getElementById('historyDetailModal'));
    this.videoPlayerModal = new Modal(document.getElementById('videoPlayerModal'));
    this.loadHistory();
  },
  methods: {
    changePage(page) {
      if (page >= 1 && page <= this.totalPages) {
        this.currentPage = page;
      }
    },
    
    jumpToPage() {
      if (this.jumpPage >= 1 && this.jumpPage <= this.totalPages) {
        this.currentPage = this.jumpPage;
      } else {
        this.jumpPage = this.currentPage;
      }
    },
    
    formatCompactDate(dateString) {
      if (!dateString) return '';
      const date = new Date(dateString);
      return `${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    },
    
    truncateText(text, maxLength) {
      if (!text) return '--';
      if (text.length <= maxLength) return text;
      return text.substring(0, maxLength) + '...';
    },
    
    resetResults() {
      this.currentResult = {
        semanticText: '',
        videoName: '',
        analysisDate: ''
      };
      this.batchProgress = {
        total: 0,
        completed: 0,
        percent: 0
      };
      this.batchResults = [];
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
    
    closeVideoPlayer() {
      this.pauseVideo();
      this.videoPlayerModal.hide();
    },
    
    pauseVideo() {
      const player = this.$refs.videoPlayer;
      if (player) {
        player.pause();
      }
    },
    
    extractFilename(filePath) {
      return filePath ? filePath.replace(/^.*[\\\/]/, '') : '--';
    },
    
    getVideoSource(rawPath) {
      if (!rawPath) return '';
      if (rawPath.startsWith('http') || rawPath.startsWith('/static')) {
        return rawPath;
      }
      const filename = encodeURIComponent(this.extractFilename(rawPath));
      return `/video-proxy/module2/${filename}`;
    },
    
    // 修改：删除单条记录，增加silent参数控制是否显示通知
    async deleteRecord(id, silent = true) {
      const confirmMessage = `确定要删除选中的记录吗？`;
      if (!confirm(confirmMessage)) return;
      
      try {
        const data = await module2API.deleteHistory(id);
        if(data.status === "success") {
          if (!silent) {
            this.$notify({
              title: '删除成功',
              message: '记录已删除',
              type: 'success'
            });
          }
          // 从选中项中移除
          this.selectedItems = this.selectedItems.filter(item => item !== id);
          // 刷新列表
          await this.loadHistory();
        } else {
          throw new Error(data.error || '删除失败');
        }
      } catch (error) {
        console.error('删除失败:', error);
        if (!silent) {
          this.$notify({
            title: '删除失败',
            message: error.message || '删除失败，请稍后重试',
            type: 'error'
          });
        }
        throw error; // 重新抛出错误以便上层捕获
      }
    },

    async ds(id, silent = true) {
      
      try {
        const data = await module2API.deleteHistory(id);
        if(data.status === "success") {
          if (!silent) {
            this.$notify({
              title: '删除成功',
              message: '记录已删除',
              type: 'success'
            });
          }
          // 从选中项中移除
          this.selectedItems = this.selectedItems.filter(item => item !== id);
          // 刷新列表
          await this.loadHistory();
        } else {
          throw new Error(data.error || '删除失败');
        }
      } catch (error) {
        console.error('删除失败:', error);
        if (!silent) {
          this.$notify({
            title: '删除失败',
            message: error.message || '删除失败，请稍后重试',
            type: 'error'
          });
        }
        throw error; // 重新抛出错误以便上层捕获
      }
    },
    
    // 新增：删除选中项
    async deleteSelectedRecords() {
      if (this.selectedItems.length === 0) return;
      
      const confirmMessage = `确定要删除选中的 ${this.selectedItems.length} 条记录吗？`;
      if (!confirm(confirmMessage)) return;
      
      this.isDeleting = true;
      
      try {
        // 使用Promise.all并行删除，提高效率
        const deletePromises = this.selectedItems.map(id => this.ds(id, false));
        await Promise.all(deletePromises);
        
        // 显示成功消息
        this.$notify({
          title: '删除成功',
          message: `已成功删除 ${this.selectedItems.length} 条记录`,
          type: 'success'
        });
        
        // 清空选择
        this.selectedItems = [];
        this.selectAll = false;
        
        // 刷新列表
        await this.loadHistory();
        
      } catch (error) {
        console.error('删除选中项失败:', error);
        this.$notify({
          title: '删除失败',
          message: '部分记录删除失败，请重试',
          type: 'error'
        });
      } finally {
        this.isDeleting = false;
        await this.loadHistory(); // 确保删除成功后重新加载
        this.selectedItems.length=0
      }
    },
    
    async deleteAllRecords() {
      const confirmMessage = this.searchQuery 
        ? `确定要删除所有筛选结果吗？` 
        : "确定要删除所有历史记录吗？";
      
      if (confirm(confirmMessage)) {
        try {
          const data = await module2API.deleteAllHistory({
            search: this.searchQuery
          });
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
    
    // 新增：全选/取消全选
    toggleSelectAll() {
      if (this.selectAll) {
        this.selectedItems = this.paginatedHistory.map(item => item.id);
      } else {
        this.selectedItems = [];
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
      this.isAnalyzing = true;
      this.resetResults();
      this.batchProgress = {
        total: files.length,
        completed: 0,
        percent: 0
      };
      
      for (const file of files) {
        try {
          const data = await module2API.uploadBatch(file);
          
          if(data.status === "success") {
            this.batchResults.push({
              filename: file.name,
              status: 'success',
              message: '分析成功'
            });
          } else {
            this.batchResults.push({
              filename: file.name,
              status: 'error',
              message: data.error || '分析失败'
            });
          }
        } catch (error) {
          console.error('上传失败:', error);
          this.batchResults.push({
            filename: file.name,
            status: 'error',
            message: error.message
          });
        } finally {
          this.batchProgress.completed++;
          this.batchProgress.percent = Math.round((this.batchProgress.completed / this.batchProgress.total) * 100);
        }
      }
      
      this.isAnalyzing = false;
      this.loadHistory();
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
        this.isDeleting = false;
      }
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
  padding: 40px;
  width: 100%;
  height: 100%;
  background: white;
  border-radius: 12px;
  margin: 20px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

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

.btn-primary {
  background: #3b87d8;
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.3s;
}

.compact-records {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.compact-record-item {
  padding: 8px;
  border-radius: 6px;
  background-color: #f9f9f9;
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

.analyzing-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(59, 135, 216, 0.2);
  border-top: 4px solid #3b87d8;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 15px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.analyzing-text {
  font-size: 18px;
  color: #3b87d8;
  font-weight: bold;
}

.table-container {
  width: 100%;
  overflow-x: auto;
  margin-bottom: 20px;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 900px;
}

.history-table th, 
.history-table td {
  padding: 12px 10px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.history-table th:nth-child(1), 
.history-table td:nth-child(1) {
  width: 60px;
}

.history-table th:nth-child(2), 
.history-table td:nth-child(2) {
  width: 150px;
}

.history-table th:nth-child(3), 
.history-table td:nth-child(3) {
  min-width: 200px;
}

.history-table th:nth-child(4), 
.history-table td:nth-child(4) {
  width: 300px;
}

.history-table th:nth-child(5), 
.history-table td:nth-child(5) {
  width: 180px;
}

.filename-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.actions-cell {
  white-space: nowrap;
  text-align: center;
}

.btn-view, .btn-play, .btn-delete {
  padding: 5px 10px;
  font-size: 0.85rem;
  margin: 0 3px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: inline-block;
}

.btn-view {
  background: #28a745;
  color: white;
}

.btn-play {
  background: #3b87d8;
  color: white;
}

.btn-delete {
  background: #dc3545;
  color: white;
}

.pagination-container {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
  padding: 10px 0;
}

.page-info {
  display: flex;
  align-items: center;
  font-size: 0.9rem;
  color: #666;
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

.page-item.active .page-link {
  background-color: #3b87d8;
  border-color: #3b87d8;
}

.video-container {
  width: 100%;
  height: 0;
  padding-bottom: 56.25%;
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

/* 批量分析进度样式 */
.batch-progress-container {
  text-align: left;
  margin-bottom: 15px;
}

.batch-progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-weight: bold;
}

.batch-progress-bar {
  height: 10px;
  background: #eee;
  border-radius: 5px;
  overflow: hidden;
  margin-bottom: 15px;
}

.batch-progress-bar div {
  height: 100%;
  background: #3b87d8;
  transition: width 0.3s ease;
}

.batch-results {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 5px;
}

.batch-result-item {
  padding: 8px;
  border-bottom: 1px solid #eee;
}

.batch-result-item:last-child {
  border-bottom: none;
}

.batch-filename {
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.batch-status {
  font-size: 0.9em;
  margin-top: 4px;
}

.batch-status.success {
  color: #28a745;
}

.batch-status.error {
  color: #dc3545;
}

/* 视频元信息样式 */
#videoMeta {
  margin-top: 15px;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 5px;
}

#videoMeta p {
  margin: 5px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 992px) {
  .feature-overview {
    grid-template-columns: repeat(2, 1fr) !important;
  }
  
  .history-table {
    min-width: 800px;
  }
  
  .history-table th:nth-child(2),
  .history-table td:nth-child(2) {
    width: 120px;
  }
  
  .actions-cell {
    width: 160px;
  }
}

@media (max-width: 768px) {
  .feature-overview {
    grid-template-columns: 1fr !important;
  }
  
  .content-area {
    padding: 20px;
  }
  
  .history-table {
    min-width: 700px;
  }
  
  .history-table th, 
  .history-table td {
    padding: 8px 6px;
    font-size: 0.85rem;
  }
  
  .btn-view, .btn-play, .btn-delete {
    padding: 4px 8px;
    font-size: 0.8rem;
    margin: 0 2px;
  }
  
  .actions-cell {
    width: 150px;
  }
}
.history-table th:first-child,
.history-table td:first-child {
  width: 40px;
  text-align: center;
}

/* 调整序号列宽度 */
.history-table th:nth-child(2), 
.history-table td:nth-child(2) {
  width: 50px;
}

/* 禁用状态样式 */
.btn-danger:disabled,
.btn-secondary:disabled,
input:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

/* 删除按钮加载状态 */
.btn-danger .spinner-border {
  margin-right: 5px;
  vertical-align: middle;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .history-table th:first-child,
  .history-table td:first-child {
    width: 30px;
  }
  
  .history-table th:nth-child(2), 
  .history-table td:nth-child(2) {
    width: 40px;
  }
}
</style>