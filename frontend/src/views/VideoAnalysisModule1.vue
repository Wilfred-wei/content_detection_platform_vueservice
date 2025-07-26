<template>
  <div class="container-fluid">
    <div class="row d-flex flex-nowrap">
      <!-- 侧边栏 -->
      <Sidebar />
      
      <!-- 主要内容区域 -->
      <main class="content col-10">
        <div class="content-area">
            <h2>视频谣言检测</h2>
          <div style="margin-bottom: 20px; color: #666; font-size: 1.1em; line-height: 1.6;">
          基于先进AI技术的视频内容可信度检测系统，对上传视频进行可信度分析并给出其可信度，越接近100表示越可能为真实视频。
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
                    </div>
                    <div id="resultDetails" style="text-align: center; color: #666;">
                      <p>{{ resultMessage }}</p>
                      <p v-if="currentVideoName">视频: {{ currentVideoName }}</p>
                      <p v-if="currentDate">检测时间: {{ currentDate }}</p>
                    </div>
                  </div>
                </div>
                
                <!-- 最新记录展示区 -->
                <div class="feature-item" style="flex: 1;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h4 style="margin: 0;">最新记录</h4>
                    <button class="btn-primary" style="padding: 5px 10px;" @click="showHistoryModal">更多</button>
                  </div>
                  <div style="height: 100%; display: flex; flex-direction: column; justify-content: center;">
                    <div id="latestRecord" style="text-align: center; color: #666;">
                      <p v-if="historyData.length === 0">暂无检测记录</p>
                      <div v-else>
                        <p><strong>{{ latestRecord.filename }}</strong></p>
                        <p>可信度: {{ latestRecord.score }}%</p>
                        <p>{{ latestRecord.date }}</p>
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
                  <h4>真实视频示例</h4>
                  <p>真实视频,上传后可信度分数应高于70%。</p>
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
                      <source :src="getVideoUrl('example3_2_1_U.mp4')" type="video/mp4">
                    </video>
                  </div>
                  <h4>可疑视频示例</h4>
                  <p>无法明确确认真假的视频，上传后可信度分数应介于30%到70%之间。</p>
                  <button class="btn-primary" @click="analyzeExample('example3_2_1_U.mp4')">分析此示例</button>
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
                      <source :src="getVideoUrl('example3_2_1_F.mp4')" type="video/mp4">
                    </video>
                  </div>
                  <h4>虚假视频示例</h4>
                  <p>虚假视频，上传后可信度分数应低于30%。</p>
                  <button class="btn-primary" @click="analyzeExample('example3_2_1_F.mp4')">分析此示例</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>

  <!-- 历史记录列表模态框 -->
  <div class="modal fade" id="historyModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">历史检测记录</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <!-- 搜索功能区 -->
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
                  <th>可信度</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody id="historyTableBody">
                <tr v-for="(item, index) in filteredHistory" :key="item.id">
                  <td>{{ index + 1 }}</td>
                  <td>{{ item.date }}</td>
                  <td>{{ item.filename }}</td>
                  <td>{{ item.score }}%</td>
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
      currentVideoName: '',
      currentDate: '',
      resultMessage: '请上传视频进行检测',
      detailScore: '--',
      detailVideoName: '',
      detailResultText: '',
      detailTimestamp: '',
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
    async loadHistory() {
      try {
        const data = await module1API.getHistory();
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
      const confirmMessage = this.searchQuery 
        ? `确定要删除所有搜索结果吗？` 
        : "确定要删除所有历史记录吗？";
      
      if (confirm(confirmMessage)) {
        try {
          const data = await module1API.deleteAllHistory();
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
      this.resultMessage = isSingle ? `正在分析视频: ${file.name}...` : '';
      
      try {
        const data = await module1API.uploadSingle(file);
        
        if(data.status === "success") {
          this.currentScore = data.result.score;
          
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
    },
    async handleExampleVideo(videoName) {
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
/* Global Styles */
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


/* Main Content */
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
  border-radius: 12px;  /* 改为12px圆角 */
  margin: 20px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);  /* 保持原有阴影 */
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
</style>
