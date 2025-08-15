<template>
  <div class="page-layout">
    <!-- Sidebar -->
    <aside class="layout-sidebar">
      <Sidebar />
    </aside>
    <!-- Main Content Area -->
    <main class="layout-main">
        <div class="content-area">
            <h2>有害视频检测</h2>
          <div style="margin-bottom: 20px; color: #666; font-size: 1.1em; line-height: 1.6;">
          基于先进AI技术的有害视频检测系统，对上传视频分析并给出其潜在危害类型，置信度越接近100表示越可能具有此类危害。
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
                    <p>点击或拖放视频文件,支持mp4，avi格式，最大500MB</p>
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
                    <p>点击或拖放多个视频,支持mp4，avi格式，最大500MB</p>
                    <input type="file" id="multiVideoInput" style="display: none;" accept="video/*" multiple @change="handleMultiUpload">
                  </label>
                </div>
              </div>
              
              <!-- 右侧结果区域 -->
              <div style="flex: 1.5; display: flex; flex-direction: column; gap: 20px;">
                <!-- 检测结果 -->
                <div class="feature-item" style="flex: 1;">
                  <h4>检测结果</h4>
                  <div style="padding: 15px; height: 100%; display: flex; flex-direction: column; justify-content: center;">
                    <!-- 分析中动画 -->
                    <div v-if="isAnalyzing" class="analyzing-container">
                      <div class="spinner"></div>
                      <div class="analyzing-text">分析中...</div>
                    </div>
                    
                    <!-- 结果展示 -->
                    <div v-else style="text-align: center; height: 100%; display: flex; flex-direction: column;">
                      <div style="flex: 1; overflow-y: auto; padding: 0 10px;">
                        <div v-if="currentScore !== '--'" style="text-align: center;">
                          <div style="font-size: 24px; font-weight: bold; color: #0056b3;">
                            置信度: <span id="scoreValue">{{ currentScore }}%</span>
                          </div>
                          <div style="height: 10px; background: #eee; border-radius: 5px; margin: 15px 0;">
                            <div id="progressBar" :style="{ width: currentScore + '%' }" style="height: 100%; background: #3b87d8; border-radius: 5px;"></div>
                          </div>
                          <div style="font-size: 18px; margin: 10px 0; color: #0056b3;">
                            潜在危害类别: <span>{{ currentCategory || '--' }}</span>
                          </div>
                        </div>
                        
                        <!-- 批量分析进度 -->
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
                                <span>置信度: {{ result.score || '--' }}%</span>
                                <span v-if="result.category"> | 类别: {{ result.category }}</span>
                                <span v-else-if="result.message"> | {{ result.message }}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <p v-else style="color: #999;">请上传视频进行检测</p>
                      </div>
                      <div id="videoMeta" style="margin-top: auto; padding: 10px; background: #f5f7fa; border-radius: 5px;">
                        <p v-if="currentVideoName" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 5px 0;">视频: {{ currentVideoName }}</p>
                        <p v-if="currentDate" style="color: #888; margin: 5px 0;">检测时间: {{ currentDate }}</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <!-- 最新记录展示区 - 紧凑样式 -->
                <div class="feature-item" style="flex: 1;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h4 style="margin: 0;">最近3次检测记录</h4>
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
                        <div class="compact-record-body">
                          <div class="compact-score">
                            <span>可信度: </span>
                            <span class="score-value">{{ record.score }}%</span>
                            <div class="compact-progress">
                              <div :style="{ width: record.score + '%' }"></div>
                            </div>
                          </div>
                          <div class="compact-category">
                            <span>类别: </span>
                            <span>{{ record.category || '--' }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 示例视频分析区域 -->
            <div class="content-area">
              <h2>示例视频分析
                <button class="btn btn-primary" style="margin-left: 10px; padding: 5px 10px;" 
                        @click="showExampleModal">更多示例</button>
              </h2>
              
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
                      <source :src="getVideoUrl('example3_2_1_T.mp4')" type="video/mp4">
                    </video>
                  </div>
                  <h4>真实无害视频</h4>
                  <p>真实且无有害信息的视频。</p>
                  <button class="btn-primary" @click="analyzeExample('example3_2_1_T.mp4')">分析此示例</button>
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
                      <source :src="getVideoUrl('example3_2_1_EYYL.mp4')" type="video/mp4">
                    </video>
                  </div>
                  <h4>恶意引流视频</h4>
                  <p>引诱用户点击相关链接或视频以攫取流量的有害视频。</p>
                  <button class="btn-primary" @click="analyzeExample('example3_2_1_EYYL.mp4')">分析此示例</button>
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
                      <source :src="getVideoUrl('example3_2_1_WFFZ.mp4')" type="video/mp4">
                    </video>
                  </div>
                  <h4>违法犯罪视频</h4>
                  <p>涉及违法犯罪手段或思想的有害视频。</p>
                  <button class="btn-primary" @click="analyzeExample('example3_2_1_WFFZ.mp4')">分析此示例</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
  </div>

  <!-- 历史记录列表模态框 - 修改后的版本 -->
  <div class="modal fade" id="historyModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-xl">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">历史检测记录</h5>
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
              
              <select class="form-select form-select-sm" v-model="categoryFilter" :disabled="isDeleting">
                <option value="">所有类别</option>
                <option v-for="category in availableCategories" 
                        :value="category" 
                        :key="category">
                  {{ category }}
                </option>
              </select>
            </div>
          </div>
          
          <!-- 表格容器 -->
          <div class="table-container">
            <table class="history-table">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" v-model="selectAll" @change="toggleSelectAll" :disabled="isDeleting || paginatedHistory.length === 0">
                  </th>
                  <th>序号</th>
                  <th>提交时间</th>
                  <th>视频名称</th>
                  <th>可信度</th>
                  <th>类别</th>
                  <th>操作</th>
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
                  <td>{{ item.score }}%</td>
                  <td>{{ item.category || '--' }}</td>
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

  <!-- 历史记录详情模态框 -->
  <div class="modal fade" id="historyDetailModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">检测结果详情</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body" style="text-align: center;">
          <div style="font-size: 24px; font-weight: bold; color: #0056b3;">
            置信度: <span id="detailScoreValue">{{ detailScore }}%</span>
          </div>
          <div style="height: 10px; background: #eee; border-radius: 5px; margin: 15px 0;">
            <div id="detailProgressBar" :style="{ width: detailScore + '%' }" style="height: 100%; background: #3b87d8; border-radius: 5px;"></div>
          </div>
          <!-- 新增的类别显示 -->
          <div style="font-size: 18px; margin: 10px 0; color: #0056b3;">
            潜在危害类别: <span>{{ detailCategory || '--' }}</span>
          </div>
          <div id="detailVideoName" style="font-weight: bold; margin-bottom: 10px;">视频: {{ detailVideoName }}</div>
          <div id="detailResultText" style="color: #666;">{{ detailResultText }}</div>
          <div id="detailTimestamp" style="color: #888; margin-top: 15px;">检测时间: {{ detailTimestamp }}</div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 示例视频模态框 -->
  <div class="modal fade" id="exampleModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-xl">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">更多示例视频</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="row">
            <!-- 示例视频卡片 - 统一灰色样式 -->
            <div class="col-md-4 mb-4" v-for="(example, index) in exampleVideos" :key="index">
              <div class="card h-100">
                <div style="height: 200px; overflow: hidden; background: #000;">
                  <video controls style="width: 100%; height: 100%; object-fit: contain;">
                    <source :src="getVideoUrl(example.filename)" type="video/mp4">
                  </video>
                </div>
                <div class="card-body">
                  <h5 class="card-title">{{ example.title }}</h5>
                  <p class="card-text">{{ example.description }}</p>
                  <div class="d-flex justify-content-between align-items-center">
                    <span class="text-muted">
                      {{ example.type === 'true' ? '真实' : example.type === 'unverified' ? '可疑' : '虚假' }}
                    </span>
                    <button class="btn btn-sm btn-primary" @click="analyzeExample(example.filename)">分析</button>
                  </div>
                </div>
              </div>
            </div>
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
</template>

<script>
import { Modal } from 'bootstrap';
import Sidebar from '../components/Sidebar.vue';
import { module1API } from '../api';

export default {
  name: 'VideoAnalysisModule1',
  components: {
    Sidebar
  },
  data() {
    return {
      historyData: [],
      searchQuery: '',
      currentScore: '--',
      currentCategory: '',
      currentVideoName: '',
      currentDate: '',
      resultMessage: '请上传视频进行检测',
      detailScore: '--',
      detailCategory: '',
      detailVideoName: '',
      detailResultText: '',
      detailTimestamp: '',
      historyModal: null,
      detailModal: null,
      exampleModal: null,
      videoPlayerModal: null,
      currentVideoUrl: '',
      exampleVideos: [
        {
          filename: 'example3_2_1_WCNBL.mp4',
          title: '未成年不良视频',
          description: '包含未成年人不良行为或易对未成年人造成负面影响的有害视频',
          type: 'fake'
        },
        {
          filename: 'example3_2_1_PHSHWD.mp4',
          title: '破坏社会稳定视频',
          description: '捏造，鼓动，宣传反党反社会言论思想与行为的有害视频',
          type: 'fake'
        },
        {
          filename: 'example3_2_1_SQDS.mp4',
          title: '色情低俗视频',
          description: '包含擦边色情性暗示等信息的有害视频',
          type: 'fake'
        },
        {
          filename: 'example3_2_1_XXBL.mp4',
          title: '血腥暴力视频',
          description: '包含血腥，暴力，猎奇等引起用户观感不适的有害视频',
          type: 'fake'
        },
        {
          filename: 'example3_2_1_DBZP.mp4',
          title: '赌博诈骗视频',
          description: '宣传赌博诈骗相关信息或引诱用户参与赌博诈骗行为的有害视频',
          type: 'fake'
        },
        {
          filename: 'example3_2_1_WGYX.mp4',
          title: '违规营销视频',
          description: '通过虚假宣传等手段欺骗误导消费者购买使用其产品的有害视频',
          type: 'fake'
        }
      ],
      currentPage: 1,
      pageSize: 10,
      sortBy: 'date',
      sortOrder: 'desc',
      maxVisiblePages: 5,
      categoryFilter: '',
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
      isAnalyzing: false,
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
      
      if (this.categoryFilter) {
        data = data.filter(item => item.category === this.categoryFilter);
      }
      
      if (this.searchQuery) {
        const query = this.searchQuery.toLowerCase();
        data = data.filter(item => 
          item.filename.toLowerCase().includes(query) ||
          item.date.includes(query) ||
          (item.category && item.category.toLowerCase().includes(query)))
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
      let startPage = Math.max(1, this.currentPage - Math.floor(this.maxVisiblePages / 2));
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
    categoryFilter() {
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
    this.exampleModal = new Modal(document.getElementById('exampleModal'));
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
    
    resetResults() {
      this.currentScore = '--';
      this.currentCategory = '';
      this.currentVideoName = '';
      this.currentDate = '';
      this.resultMessage = '请上传视频进行检测';
      this.batchProgress = {
        total: 0,
        completed: 0,
        percent: 0
      };
      this.batchResults = [];
    },

    async loadHistory() {
      try {
        const data = await module1API.getHistory();
        this.historyData = data;
        this.updateAvailableCategories();
      } catch (error) {
        console.error('加载历史记录失败:', error);
      }
    },
    
    updateAvailableCategories() {
      const categories = new Set();
      this.historyData.forEach(item => {
        if (item.category) {
          categories.add(item.category);
        }
      });
      this.availableCategories = Array.from(categories);
    },

    showHistoryModal() {
      this.historyModal.show();
    },
    
    showExampleModal() {
      this.exampleModal.show();
    },
    
    async showDetailModal(id) {
      try {
        const response = await module1API.getHistoryDetail(id);
        
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
        this.detailVideoName = record.filename;
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
    
    extractFilename(filePath) {
      return filePath ? filePath.replace(/^.*[\\\/]/, '') : '--';
    },
    
    getVideoSource(rawPath) {
      if (!rawPath) return '';
      if (rawPath.startsWith('http') || rawPath.startsWith('/static')) {
        return rawPath;
      }
      const filename = encodeURIComponent(this.extractFilename(rawPath));
      return `/video-proxy/module1/${filename}`;
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

    async deleteRecord(id, silent = true) {
      const confirmMessage = `确定要删除选中的记录吗？`;
      if (!confirm(confirmMessage)) return;
      try {
        const data = await module1API.deleteHistory(id);
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
        throw error;
      }
    },
    
    async ds(id, silent = true) {
      try {
        const data = await module1API.deleteHistory(id);
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
        throw error;
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
      const confirmMessage = this.searchQuery || this.categoryFilter
        ? `确定要删除所有筛选结果吗？` 
        : "确定要删除所有历史记录吗？";
      
      if (confirm(confirmMessage)) {
        try {
          const data = await module1API.deleteAllHistory({
            search: this.searchQuery,
            category: this.categoryFilter
          });
          if(data.status === "success") {
            this.loadHistory();
            this.searchQuery = '';
            this.categoryFilter = '';
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
      this.categoryFilter = '';
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
      this.resetResults();
      this.isAnalyzing = true;
      this.resultMessage = isSingle ? `正在分析视频: ${file.name}...` : '';
      
      try {
        const data = await module1API.uploadSingle(file);
        
        if(data.status === "success") {
          this.currentScore = data.result.score;
          this.currentCategory = data.result.category || '';
          this.currentVideoName = file.name;
          this.currentDate = data.result.date;
          
          this.loadHistory();
        } else {
          throw new Error(data.error || '上传失败');
        }
      } catch (error) {
        console.error('上传失败:', error);
        this.resultMessage = `上传失败: ${error.message}`;
      } finally {
        this.isAnalyzing = false;
      }
    },
    
    async handleBatchUpload(files) {
      this.resetResults();
      this.isAnalyzing = true;
      this.batchProgress = {
        total: files.length,
        completed: 0,
        percent: 0
      };
      
      for (const file of files) {
        try {
          const data = await module1API.uploadBatch(file);
          
          if(data.status === "success") {
            this.batchResults.push({
              filename: file.name,
              status: 'success',
              score: data.result.score,
              category: data.result.category || '',
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
      return module1API.getExampleVideoUrl(videoName);
    },
    
    analyzeExample(videoName) {
      this.handleExampleVideo(videoName);
      this.exampleModal.hide();
    },
    
    async handleExampleVideo(videoName) {
      this.resetResults();
      this.isAnalyzing = true;
      this.resultMessage = '正在准备示例视频分析...';
      
      try {
        const videoPath = module1API.getExampleVideoUrl(videoName);
        const response = await fetch(videoPath);
        if (!response.ok) throw new Error('无法加载示例视频');
        
        const blob = await response.blob();
        const file = new File([blob], videoName, { type: blob.type });
        
        this.resultMessage = `正在分析示例视频: ${videoName}...`;
        await this.handleFileUpload(file, true);
        
      } catch (error) {
        console.error('示例视频处理失败:', error);
        this.resultMessage = `示例视频分析失败: ${error.message}`;
      } finally {
        this.isAnalyzing = false;
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

.compact-record-body {
  display: flex;
  gap: 10px;
  align-items: center;
}

.compact-score {
  flex: 1;
  display: flex;
  align-items: center;
  font-size: 0.85em;
}

.compact-progress {
  flex: 1;
  height: 6px;
  background: #eee;
  border-radius: 3px;
  overflow: hidden;
}

.compact-progress div {
  height: 100%;
  background: #3b87d8;
  border-radius: 3px;
}

.card {
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
  transition: transform 0.3s ease;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 历史记录表格样式 */
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

/* 调整各列宽度 */
.history-table th:nth-child(1), 
.history-table td:nth-child(1) {
  width: 40px;
  text-align: center;
}

.history-table th:nth-child(2), 
.history-table td:nth-child(2) {
  width: 50px;
}

.history-table th:nth-child(3), 
.history-table td:nth-child(3) {
  min-width: 200px;
}

.history-table th:nth-child(4), 
.history-table td:nth-child(4) {
  width: 100px;
}

.history-table th:nth-child(5), 
.history-table td:nth-child(5) {
  width: 120px;
}

.history-table th:nth-child(6), 
.history-table td:nth-child(6) {
  width: 180px;
}

/* 文件名单元格 */
.filename-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

/* 操作单元格 */
.actions-cell {
  white-space: nowrap;
  text-align: center;
}

/* 按钮样式调整 */
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

/* 分页样式 */
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

/* 页码跳转样式 */
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

/* 分析动画样式 */
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

.modal-lg {
  max-width: 800px;
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
    width: 140px;
  }
  
  /* 移动端调整分页布局 */
  .pagination-container {
    flex-direction: column;
    gap: 10px;
  }
  
  .page-jump {
    justify-content: center;
  }
}
</style>