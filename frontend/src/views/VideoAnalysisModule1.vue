<template>
  <div class="page-layout">
    <!-- Sidebar -->
    <aside class="layout-sidebar">
      <Sidebar />
    </aside>
    <!-- Main Content Area -->
    <main class="layout-main">
        <div class="content-area">
            <h2>视频可信度及危害类型检测</h2>
          <div style="margin-bottom: 20px; color: #666; font-size: 1.1em; line-height: 1.6;">
          基于先进AI技术的视频可信度及危害类型检测系统，对上传视频进行可信度分析并给出其可信度与可能危害类型，可信度越接近100表示可信度越高。
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
                    <div style="text-align: center;">
                      <div style="font-size: 24px; font-weight: bold; color: #0056b3;">
                        可信度: <span id="scoreValue">{{ currentScore }}%</span>
                      </div>
                      <div style="height: 10px; background: #eee; border-radius: 5px; margin: 15px 0;">
                        <div id="progressBar" :style="{ width: currentScore + '%' }" style="height: 100%; background: #3b87d8; border-radius: 5px;"></div>
                      </div>
                      <!-- 新增的视频类别显示行 -->
                      <div style="font-size: 18px; margin: 10px 0; color: #0056b3;">
                        潜在危害类别: <span>{{ currentCategory || '--' }}</span>
                      </div>
                    </div>
                    <div id="resultDetails" style="text-align: center; color: #666;">
                      <p>{{ resultMessage }}</p>
                      <p v-if="currentVideoName">视频: {{ currentVideoName }}</p>
                      <p v-if="currentDate">检测时间: {{ currentDate }}</p>
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
                  <p>真实且无有害信息的视频，可信度应高于70%并未被认定包含有害内容。</p>
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

  <!-- 历史记录列表模态框 -->
  <div class="modal fade" id="historyModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-xl">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">历史检测记录</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <!-- 搜索和排序功能区 -->
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
              <!-- 新增的分类筛选下拉框 -->
              <select class="form-select" v-model="categoryFilter" style="width: 150px;">
                <option value="">所有类别</option>
                <option v-for="category in availableCategories" :value="category" :key="category">{{ category }}</option>
              </select>
            </div>
          </div>
          
          <div class="task-table-wrapper">
            <table class="history-table">
              <thead>
                <tr>
                  <th>序号</th>
                  <th>提交时间</th>
                  <th>视频名称</th>
                  <th>可信度</th>
                  <th>类别</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody id="historyTableBody">
                <tr v-for="(item, index) in paginatedHistory" :key="item.id">
                  <td>{{ (currentPage - 1) * pageSize + index + 1 }}</td>
                  <td>{{ item.date }}</td>
                  <td>{{ item.filename }}</td>
                  <td>{{ item.score }}%</td>
                  <td>{{ item.category || '--' }}</td>
                  <td class="task-actions">
                    <button class="btn-view" @click="showDetailModal(item.id)">查看</button>
                    <button class="btn-delete" @click="deleteRecord(item.id)">删除</button>
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
                  <a class="page-link" href="#" aria-label="Previous" @click.prevent="changePage(currentPage - 1)">
                    <span aria-hidden="true">&laquo;</span>
                  </a>
                </li>
                <li class="page-item" v-for="page in visiblePages" :key="page" 
                    :class="{ active: page === currentPage }">
                  <a class="page-link" href="#" @click.prevent="changePage(page)">{{ page }}</a>
                </li>
                <li class="page-item" :class="{ disabled: currentPage === totalPages }">
                  <a class="page-link" href="#" aria-label="Next" @click.prevent="changePage(currentPage + 1)">
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
            可信度: <span id="detailScoreValue">{{ detailScore }}%</span>
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
      // 新增的分页和排序相关数据
      currentPage: 1,
      pageSize: 10,
      sortBy: 'date', // date or name
      sortOrder: 'desc', // asc or desc
      maxVisiblePages: 5, // 最多显示的分页按钮数
      // 新增的分类筛选
      categoryFilter: '',
      availableCategories: [
        '真实无害',
        '恶意引流',
        '违法犯罪',
        '未成年不良',
        '破坏社会稳定',
        '色情低俗',
        '血腥暴力',
        '赌博诈骗',
        '违规营销'
      ]
    };
  },
  computed: {
    // 排序后的历史记录
    sortedHistory() {
      let data = [...this.historyData];
      
      // 应用分类筛选
      if (this.categoryFilter) {
        data = data.filter(item => item.category === this.categoryFilter);
      }
      
      if (this.searchQuery) {
        const query = this.searchQuery.toLowerCase();
        data = data.filter(item => 
          item.filename.toLowerCase().includes(query) ||
          item.date.includes(query) ||
          (item.category && item.category.toLowerCase().includes(query))
        );
      }
      
      // 排序逻辑
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
    
    // 分页后的历史记录
    paginatedHistory() {
      const start = (this.currentPage - 1) * this.pageSize;
      const end = start + this.pageSize;
      return this.sortedHistory.slice(start, end);
    },
    
    // 总页数
    totalPages() {
      return Math.ceil(this.sortedHistory.length / this.pageSize);
    },
    
    // 可见的分页按钮
    visiblePages() {
      const pages = [];
      let startPage = Math.max(1, this.currentPage - Math.floor(this.maxVisiblePages / 2));
      let endPage = Math.min(this.totalPages, startPage + this.maxVisiblePages - 1);
      
      // 调整起始页，确保显示maxVisiblePages个按钮
      if (endPage - startPage + 1 < this.maxVisiblePages) {
        startPage = Math.max(1, endPage - this.maxVisiblePages + 1);
      }
      
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
      
      return pages;
    },
    
    // 获取最近的3条记录
    recentRecords() {
      return this.historyData.slice().reverse().slice(0, 3);
    }
  },
  watch: {
    // 当排序方式或搜索条件变化时，重置到第一页
    sortBy() {
      this.currentPage = 1;
    },
    sortOrder() {
      this.currentPage = 1;
    },
    searchQuery() {
      this.currentPage = 1;
    },
    // 新增：分类筛选变化时重置页码
    categoryFilter() {
      this.currentPage = 1;
    }
  },
  mounted() {
    this.historyModal = new Modal(document.getElementById('historyModal'));
    this.detailModal = new Modal(document.getElementById('historyDetailModal'));
    this.exampleModal = new Modal(document.getElementById('exampleModal'));
    this.loadHistory();
  },
  methods: {
    // 切换页码
    changePage(page) {
      if (page >= 1 && page <= this.totalPages) {
        this.currentPage = page;
      }
    },
    
    // 格式化日期为紧凑格式
    formatCompactDate(dateString) {
      if (!dateString) return '';
      const date = new Date(dateString);
      return `${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    },
    
    // 重置结果显示区域
    resetResults() {
      this.currentScore = '--';
      this.currentCategory = '';
      this.currentVideoName = '';
      this.currentDate = '';
      this.resultMessage = '请上传视频进行检测';
    },

    async loadHistory() {
      try {
        const data = await module1API.getHistory();
        this.historyData = data;
        // 更新可用的分类选项
        this.updateAvailableCategories();
      } catch (error) {
        console.error('加载历史记录失败:', error);
      }
    },
    
    // 更新可用的分类选项
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
        
        if(record.score > 70) this.detailResultText = '内容可信度较高';
        else if(record.score > 30) this.detailResultText = '内容存在可疑之处';
        else this.detailResultText = '内容可信度较低';
        
        this.detailTimestamp = record.date;
        
        this.detailModal.show();
      } catch (error) {
        console.error('获取详情失败:', error);
        alert('获取详情失败: ' + error.message);
      }
    },
    async deleteRecord(id) {
      if(confirm('确定删除这条记录吗？')) {
        try {
          const data = await module1API.deleteHistory(id);
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
      // 重置结果区域
      this.resetResults();
      this.resultMessage = isSingle ? `正在分析视频: ${file.name}...` : '';
      
      try {
        const data = await module1API.uploadSingle(file);
        
        if(data.status === "success") {
          this.currentScore = data.result.score;
          this.currentCategory = data.result.category || '';
          
          if(data.result.score > 70) this.resultMessage = '内容可信度较高';
          else if(data.result.score > 30) this.resultMessage = '内容存在可疑之处';
          else this.resultMessage = '内容可信度较低';
          
          this.currentVideoName = file.name;
          this.currentDate = data.result.date;
          
          this.loadHistory();
        } else {
          throw new Error(data.error || '上传失败');
        }
      } catch (error) {
        console.error('上传失败:', error);
        this.resultMessage = `上传失败: ${error.message}`;
      }
    },
    async handleBatchUpload(files) {
      // 重置结果区域
      this.resetResults();
      this.resultMessage = `开始批量上传 ${files.length} 个视频...`;
      
      let completed = 0;
      let hasError = false;
      
      for (const file of files) {
        if (hasError) break;
        
        try {
          const data = await module1API.uploadBatch(file);
          
          if(data.status === "success") {
            completed++;
            this.resultMessage = `已完成 ${completed}/${files.length} 个视频分析...`;
            
            if (completed === files.length) {
              this.resultMessage += `\n批量分析完成`;
              this.loadHistory();
            }
          } else {
            throw new Error(data.error || '上传失败');
          }
        } catch (error) {
          console.error('上传失败:', error);
          hasError = true;
          this.resultMessage = `上传失败: ${file.name} - ${error.message}`;
        }
      }
    },
    getVideoUrl(videoName) {
      return module1API.getExampleVideoUrl(videoName);
    },
    analyzeExample(videoName) {
      this.handleExampleVideo(videoName);
      this.exampleModal.hide();
    },
    async handleExampleVideo(videoName) {
      // 重置结果区域
      this.resetResults();
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

.content-area {
  padding: 40px;
  width: 100%;
  height: 100%;
  background: white;
  border-radius: 12px;
  margin: 20px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.content-area h2 {
  color: #0056b3;
  margin-bottom: 20px;
  font-size: 2em;
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 10px;
  display: flex;
  align-items: center;
}

.content-area p {
  color: #666;
  font-size: 1.1em;
  line-height: 1.6;
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
  transition: background 0.3s;
}

.btn-primary:hover {
  background: #2a6fc9;
}

/* 紧凑记录样式 */
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

.compact-record-item:last-child {
  margin-bottom: 0;
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

.score-value {
  font-weight: bold;
  color: #3b87d8;
  margin: 0 5px;
  min-width: 30px;
  display: inline-block;
  text-align: right;
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

.compact-category {
  font-size: 0.85em;
  color: #666;
  min-width: 100px;
}

/* Example Video Cards */
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

.card:hover {
  transform: translateY(-5px);
  box-shadow: 0 4px 15px rgba(0,0,0,0.2);
}

.card-body {
  padding: 15px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.card-title {
  color: #0056b3;
  margin-bottom: 10px;
  font-size: 1.1em;
}

.card-text {
  color: #666;
  font-size: 0.9em;
  margin-bottom: 15px;
  flex: 1;
}

.text-muted {
  color: #6c757d;
}

/* 历史记录表格样式 - 新增 */
.task-table-wrapper {
  width: 100%;
  overflow-x: hidden; /* 移除横向滚动 */
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed; /* 固定表格布局 */
}

.history-table th, 
.history-table td {
  padding: 12px 15px;
  text-align: left;
  border-bottom: 1px solid #eee;
  word-wrap: break-word; /* 允许长单词换行 */
}

.history-table th {
  background-color: #f8f9fa;
  font-weight: 600;
  color: #495057;
}

.history-table tr:hover {
  background-color: #f8f9fa;
}

/* 操作按钮样式 */
.task-actions {
  display: flex;
  gap: 8px;
}

.btn-view {
  background: #28a745;
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
}

.btn-delete {
  background: #dc3545;
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
}

/* 列宽设置 */
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
  width: 12%;
}

.history-table th:nth-child(5),
.history-table td:nth-child(5) {
  width: 15%;
}

.history-table th:nth-child(6),
.history-table td:nth-child(6) {
  width: 20%;
}

/* 分页样式 */
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

/* Responsive Grid */
@media (max-width: 992px) {
  .feature-overview {
    grid-template-columns: repeat(2, 1fr) !important;
  }
  
  /* 在小屏幕下调整表格列宽 */
  .history-table th:nth-child(1),
  .history-table td:nth-child(1) {
    width: 10%;
  }
  
  .history-table th:nth-child(2),
  .history-table td:nth-child(2) {
    width: 25%;
  }
  
  .history-table th:nth-child(3),
  .history-table td:nth-child(3) {
    width: 30%;
  }
  
  .history-table th:nth-child(4),
  .history-table td:nth-child(4),
  .history-table th:nth-child(5),
  .history-table td:nth-child(5) {
    width: 15%;
  }
  
  .history-table th:nth-child(6),
  .history-table td:nth-child(6) {
    width: 25%;
  }

  /* 紧凑记录在小屏幕下的调整 */
  .compact-record-body {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .compact-category {
    min-width: auto;
  }

  /* 分页在小屏幕下的调整 */
  .pagination-container {
    flex-direction: column;
    gap: 10px;
  }
}

@media (max-width: 768px) {
  .feature-overview {
    grid-template-columns: 1fr !important;
  }
  
  .content-area {
    padding: 20px;
  }
  
  /* 在更小的屏幕下隐藏某些列 */
  .history-table th:nth-child(2),
  .history-table td:nth-child(2),
  .history-table th:nth-child(5),
  .history-table td:nth-child(5) {
    display: none;
  }
  
  /* 调整剩余列的宽度 */
  .history-table th:nth-child(1),
  .history-table td:nth-child(1) {
    width: 15%;
  }
  
  .history-table th:nth-child(3),
  .history-table td:nth-child(3) {
    width: 40%;
  }
  
  .history-table th:nth-child(4),
  .history-table td:nth-child(4) {
    width: 20%;
  }
  
  .history-table th:nth-child(6),
  .history-table td:nth-child(6) {
    width: 25%;
  }
}
</style>
