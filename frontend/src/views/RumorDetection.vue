<template>
  <div class="container-fluid">
    <div class="row d-flex flex-nowrap">
      <!-- 侧边栏 -->
      <Sidebar/>

      <!-- 主要内容区域 -->
      <main class="content col-10">
        <div class="content-area">
          <h2>图文谣言检测</h2>
          <p class="description">输入文本内容或上传图片，系统将分析并判断是否为谣言信息</p>

          <!-- 检测容器 -->
          <div class="detection-container">
            <!-- 输入区域 -->
            <div class="input-section">
              <div class="card border-0 shadow-sm h-100">
                <div class="card-header bg-primary text-white">
                  <h5 class="card-title mb-0">
                    <i class="fas fa-edit "></i>
                    输入检测内容
                  </h5>
                </div>
                <div class="card-body">
                  <div>
                    <label for="text-input">文本内容：</label>
                    <textarea
                        id="text-input"
                        v-model="textInput"
                        placeholder="请输入需要检测的文本内容..."
                        @input="clearResults"
                    ></textarea>
                  </div>
                  <div>
                    <label>上传图片：</label>
                    <!-- 上传区域开始 -->
                    <div class="upload-area"
                         :class="{ 'upload-hover': isDragOver }"
                         @dragover.prevent="handleDragOver"
                         @dragleave.prevent="handleDragLeave"
                         @drop.prevent="handleDrop"
                         @click="!selectedFile && $refs.fileInput.click()">

                      <!-- 上传预览内容 -->
                      <div class="upload-content">
                        <div v-if="!selectedFile" class="upload-empty">
                          <div class="upload-icon">📁</div>
                          <div>拖放图片到此处或点击上传</div>
                          <div class="upload-hint">支持 JPG, PNG 格式，最大 20MB</div>
                        </div>

                        <div v-else class="upload-preview">
                          <div class="image-preview">
                            <img :src="imagePreviewUrl" alt="预览图片" class="preview-img">
                            <button @click.stop="clearFile" class="clear-btn">
                              删除
                            </button>
                          </div>
                          <div class="file-info">
                            <strong>{{ selectedFile.name }}</strong>
                            <br>
                            <small>{{ formatFileSize(selectedFile.size) }}</small>
                          </div>
                        </div>
                      </div>

                      <input
                          ref="fileInput"
                          accept="image/*"
                          hidden
                          type="file"
                          @change="handleFileSelected"
                      >
                    </div>
                    <!-- 上传区域结束 -->
                  </div>
                  <div class="d-grid">
                    <button
                        class="btn btn-primary btn-lg"
                        @click="performDetection"
                        :disabled="isLoading"
                    >
                      <span v-if="isLoading">
                        <i class="fas fa-spinner fa-spin "></i>
                        检测中...
                      </span>
                      <span v-else>
                        <i class="fas fa-search "></i>
                        开始检测
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 结果区域 -->
            <div class="result-section">
              <div class="card border-0 shadow-sm h-100">
                <div class="card-header bg-success text-white">
                  <h5 class="card-title mb-0">
                    <i class="fas fa-chart-line "></i>
                    检测结果
                  </h5>
                </div>
                <div class="card-body">
                  <!-- 检测中状态 - 新增的进度模拟 -->
                  <div v-if="isLoading" class="result-loading text-center py-5">
                    <div class="spinner-border text-primary mb-3" style="width: 3rem; height: 3rem;">
                      <span class="visually-hidden">检测中...</span>
                    </div>
                    <h5>正在分析内容...</h5>
                    <p class="text-muted">这可能需要几秒钟时间</p>

                    <!-- 检测进度模拟 -->
                    <div class="progress mt-3" style="height: 8px; width: 100%;">
                      <div class="progress-bar progress-bar-striped progress-bar-animated bg-primary"
                           style="width: 100%">
                      </div>
                    </div>
                  </div>

                  <!-- 检测失败 -->
                  <div v-else-if="errorMessage" class="result-error text-center py-4">
                    <i class="fas fa-exclamation-triangle text-danger fa-3x mb-3"></i>
                    <h5 class="text-danger">检测失败</h5>
                    <p class="text-muted">{{ errorMessage }}</p>
                    <button @click="resetDetection" class="btn btn-primary d-block mx-auto">
                      <i class="fas fa-redo "></i>
                      重新尝试
                    </button>
                  </div>

                  <!-- 检测结果展示 -->
                  <div v-else-if="detectionResult" class="result-content">
                    <div class="alert" :class="statusClass">
                      <div class="align-items-center">
                        <div class="result-icon" :class="statusClass">
                          {{ statusIcon }}
                        </div>
                        <div class="ms-3">
                          <h5 class="mb-1">{{ detectionResultText }}</h5>
                          <p class="mb-0">
                            可信度: <strong>{{ confidencePercent }}%</strong>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div class="confidence-meter mt-3">
                      <div
                          class="confidence-fill"
                          :style="{ width: confidencePercent + '%' }"
                      ></div>
                      <div class="confidence-label">{{ confidencePercent }}%</div>
                    </div>

                    <!-- 结果详情展示 -->
                    <div class="result-details mt-4">
                      <div class="detail-item">
                        <span class="detail-label">谣言概率:</span>
                        <span class="detail-value">{{ rumorProbability }}%</span>
                      </div>

                      <div class="detail-item">
                        <span class="detail-label">风险等级:</span>
                        <span class="risk-level" :class="riskLevelClass">
                          {{ detectionResult.risk_level || '未知' }}
                        </span>
                      </div>
                    </div>
                  </div>

                  <!-- 初始/空状态 -->
                  <div v-else class="result-placeholder text-center py-5">
                    <i class="fas fa-chart-bar fa-3x text-muted mb-3"></i>
                    <h5 class="text-muted">等待检测</h5>
                    <p class="text-muted">请先输入内容并开始检测</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 展示区域 -->
          <div class="example-section">
            <div class="card border-0 shadow-sm h-100">
              <div class="card-header bg-info text-white">
                <h5 class="card-title mb-0">
                  <i class="fas fa-lightbulb "></i>
                  样例展示
                </h5>
              </div>
              <div class="card-body">
                <!-- 样例内容 -->
                <div class="examples-container">
                  <!-- 样例1 -->
                  <div class="example-item">
                    <div class="example-header">
                      <h6>台风韦帕登陆范围再次西移</h6>
                      <button class="btn btn-sm btn-outline-primary" @click="useExample(0)">
                        点击使用此示例
                      </button>
                    </div>
                    <div class="example-content">
                      <p>
                        【#台风韦帕登陆范围再次西移#：将在广东珠海到海南文昌一带沿海登陆】#台风韦帕6级风圈直径超900公里#中央气象台7月19日18时发布台风橙色预警...</p>
                      <img src="/examples/example1.jpg" alt="example1" style="max-width:50px; max-height:50px">
                    </div>
                  </div>

                  <!-- 样例2 -->
                  <div class="example-item">
                    <div class="example-header">
                      <h6>韩国申遗全面溃败</h6>
                      <button class="btn btn-sm btn-outline-primary" @click="useExample(1)">
                        点击使用此示例
                      </button>
                    </div>
                    <div class="example-content">
                      <p>
                        韩国非遗翻车大快人心！泡菜祖宗在中国，证据甩脸上还嘴硬？申遗变"申遗"（遗臭万年），干脆再申个"碰瓷非遗"算了！联合国干得漂亮...</p>
                      <img src="/examples/example2.jpg" alt="example2" style="max-width:50px; max-height:50px">
                    </div>
                  </div>

                  <!-- 样例3 -->
                  <div class="example-item">
                    <div class="example-header">
                      <h6>武汉女孩远嫁非洲后生活艰难</h6>
                      <button class="btn btn-sm btn-outline-primary" @click="useExample(2)">
                        点击使用此示例
                      </button>
                    </div>
                    <div class="example-content">
                      <p>
                        #武汉女孩远嫁非洲后生活艰难#说句实在的，每个人选的路，哭着也得走完，这话糙理不糙。就像那位远嫁非洲的武汉女孩，不管当初是被爱情冲昏头...</p>
                      <img src="/examples/example3.jpg" alt="example3" style="max-width:50px; max-height:50px">
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted} from 'vue'
import Sidebar from '../components/Sidebar.vue'
import {rumorAPI} from '../api'

// 类型定义
interface RumorDetectionResult {
  is_rumor: boolean
  confidence: number
  result: string
  created_at: string
  reasoning?: string[]
  sources_checked?: string[]
  risk_level?: string
  probability?: number   // 谣言概率 (0~1)
}

interface ExampleData {
  title: string;
  text: string;
  imageUrl: string;
}

// 响应式变量
const textInput = ref('')
const selectedFile = ref<File | null>(null)
const isLoading = ref(false)
const detectionResult = ref<RumorDetectionResult | null>(null)
const errorMessage = ref('')
const isDragOver = ref(false)
const imagePreviewUrl = ref('')

// 计算属性
const confidencePercent = computed(() => {
  if (!detectionResult.value) return 0
  return Math.round(detectionResult.value.confidence * 100)
})

const detectionResultText = computed(() => {
  if (!detectionResult.value) return ''
  return detectionResult.value.result
})

const rumorProbability = computed(() => {
  if (!detectionResult.value || detectionResult.value.probability === undefined)
    return '--'
  return Math.round((detectionResult.value.probability || 0) * 100)
})

const riskLevelClass = computed(() => {
  if (!detectionResult.value?.risk_level) return 'risk-unknown'

  const level = detectionResult.value.risk_level.toLowerCase()
  if (level.includes('high')) return 'risk-high'
  if (level.includes('medium')) return 'risk-medium'
  if (level.includes('low')) return 'risk-low'
  return 'risk-unknown'
})

const statusClass = computed(() => {
  if (!detectionResult.value) return ''
  const confidence = detectionResult.value.confidence * 100
  if (confidence < 30) return 'rumor'
  if (confidence > 70) return 'truth'
  return 'uncertain'
})

const statusIcon = computed(() => {
  const confidence = detectionResult.value?.confidence ? detectionResult.value.confidence * 100 : 0
  if (confidence < 30) return '⚠️'
  if (confidence > 70) return '✅'
  return '❓'
})

// 文件处理方法
const handleDragOver = (event: DragEvent) => {
  event.preventDefault()
  isDragOver.value = true
}

const handleDragLeave = (event: DragEvent) => {
  event.preventDefault()
  isDragOver.value = false
}

const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  isDragOver.value = false

  const files = event.dataTransfer?.files
  if (files && files[0]) {
    processFile(files[0])
  }
}

const handleFileSelected = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    processFile(input.files[0])
  }
}

const processFile = (file: File) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg']
  if (!allowedTypes.includes(file.type)) {
    errorMessage.value = '不支持的文件格式，请选择 JPG 或 PNG 格式的图像'
    return
  }

  const maxSize = 20 * 1024 * 1024
  if (file.size > maxSize) {
    errorMessage.value = '文件大小超出限制，最大支持 20MB'
    return
  }

  selectedFile.value = file
  errorMessage.value = ''
  clearResults()

  const reader = new FileReader()
  reader.onload = (e) => {
    imagePreviewUrl.value = e.target?.result as string
  }
  reader.readAsDataURL(file)
}

// 核心功能方法
const clearFile = () => {
  selectedFile.value = null
  imagePreviewUrl.value = ''
  clearResults()
}

const clearResults = () => {
  detectionResult.value = null
  errorMessage.value = ''
}

const resetDetection = () => {
  clearResults()
  selectedFile.value = null
  textInput.value = ''
}

const performDetection = async () => {
  errorMessage.value = ''
  isLoading.value = true

    // 检查是否上传了图片
  if (!selectedFile.value) {
    errorMessage.value = '请上传图片，图文结合检测必须上传图片';
    isLoading.value = false;
    return;
  }

  try {
    const response = await rumorAPI.analyze({
      text: textInput.value.trim(),
      image: selectedFile.value
    })

    console.log('API响应:', response) // 调试日志

    if (response.success) {
      detectionResult.value = {
        is_rumor: response.is_rumor,
        confidence: response.confidence,
        result: response.is_rumor ? '谣言' : '非谣言',
        created_at: new Date().toISOString(),
        // 确保新字段正确映射
        risk_level: response.result?.risk_level || '未知',
        probability: response.result?.probability ?? 0, // 使用空值合并运算符
        reasoning: response.result?.reasoning ?? [],
        sources_checked: response.result?.sources_checked ?? []
      }
    } else {
      errorMessage.value = response.message || '检测失败，请重试'
    }
  } catch (error: any) {
    console.error('检测错误:', error)
    errorMessage.value = error.message || '检测服务暂时不可用，请稍后重试'
  } finally {
    isLoading.value = false
  }
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 示例相关方法
const examples: ExampleData[] = [
  {
    title: "台风韦帕登陆范围再次西移",
    text: "【#台风韦帕登陆范围再次西移#：将在广东珠海到海南文昌一带沿海登陆】#台风韦帕6级风圈直径超900公里#中央气象台7月19日18时发布台风橙色预警：预计，\"韦帕\"将以每小时30公里左右的速度向西偏北方向快速移动，强度继续加强，向广东珠海到海南文昌一带沿海靠近，并将于20日下午至夜间在上述沿海登陆（13～14级，38～45米/秒，台风级或强台风级），以后穿过广东雷州半岛，21日白天移入北部湾海面，随后趋向越南北部沿海。与今天稍早前中央气象台台风预警提到的\"向广东深圳到海南文昌一带沿海靠近\"相比，登陆预测范围西移。#广东人台风天非必要不出门#",
    imageUrl: "/examples/example1.jpg"
  },
  {
    title: "韩国申遗全面溃败",
    text: "韩国申遗全面溃败\n\n韩国非遗翻车大快人心！泡菜祖宗在中国，证据甩脸上还嘴硬？申遗变\"申遗\"（遗臭万年），干脆再申个\"碰瓷非遗\"算了！联合国干得漂亮，建议下次把韩剧\"抄袭中国古装\"也查查。笑死，泡菜菌群检测直接认祖归宗，韩国网友破防现场。要不再申个\"宇宙起源\"吧，反正按他们的逻辑，全宇宙都是韩国的！\n\n韩国5项非遗项目因证据不足面临撤销，泡菜文化、燃灯会、端午祭被列入审查名单。中国提交137项实证，揭露其文化溯源问题。韩国可能需支付2.3亿美元补偿金，并被列入\"文化诚信观察名单\"。网友和学者批评韩国文化断层及申遗材料造假。此前榫卯、儒学书院等申遗也曾引发争议。真正的文化遗产无需\"碰瓷\"，历史自会证明。#韩国申遗全面溃败##热点观点#",
    imageUrl: "/examples/example2.jpg"
  },
  {
    title: "武汉女孩远嫁非洲后生活艰难",
    text: "#武汉女孩远嫁非洲后生活艰难#说句实在的，每个人选的路，哭着也得走完，这话糙理不糙。就像那位远嫁非洲的武汉女孩，不管当初是被爱情冲昏头，还是对远方有不切实际的幻想，既然做了选择，就得扛住随之而来的难。\n\n生活从不会因为\"我没想到\"就手下留情。远嫁前，哪怕花点时间查查当地的生活习惯、经济水平，问问去过的人，也不至于把日子过得太狼狈。可要是闭着眼往前冲，把婚姻当赌局，那输了就得认。文化差异不是小事，语言不通、饮食不惯、没朋友没依靠，这些难题不会凭空消失，都是当初拍板时没掂量清楚的代价。\n\n有人可能会说\"太狠心\"，但现实就是这么回事。就像有人明知道熬夜伤身体还天天熬，生病了能怪谁？有人借钱炒股想暴富，亏了能赖市场吗？选择和代价从来都是绑在一起的，你选了它的甜，就得接得住它的苦。\n\n当然，说这些不是看笑话，而是想让人明白：做选择时别偷懒，多想想最坏的结果能不能扛。真选错了也别死扛，及时止损也是种本事。但不管怎么说，自己选的路，代价总得自己付------这不是惩罚，是生活教我们长大的学费。",
    imageUrl: "/examples/example3.jpg"
  }
];

const useExample = async (index: number) => {
  const example = examples[index];
  textInput.value = example.text;
  clearResults();

  try {
    const response = await fetch(example.imageUrl);
    if (!response.ok) throw new Error(`无法加载示例图片: ${response.statusText}`);

    const blob = await response.blob();
    const file = new File([blob], `example${index + 1}.jpg`, {type: blob.type});

    selectedFile.value = file;
    imagePreviewUrl.value = URL.createObjectURL(file);
    showAlert(`已加载样例：${example.title}`, 'success');
  } catch (error: any) {
    console.error('加载示例图片失败:', error);
    errorMessage.value = `加载示例图片失败: ${error.message}`;
  }

  const inputSection = document.querySelector('.input-section');
  if (inputSection) inputSection.scrollIntoView({behavior: 'smooth', block: 'start'});
};

const showAlert = (message: string, type: string) => {
  const alert = document.createElement('div');
  alert.className = `custom-alert alert alert-${type}`;
  alert.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1050;
    padding: 15px 25px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: fadeIn 0.5s, fadeOut 0.5s 2.5s;
  `;

  alert.innerHTML = `
    <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-info-circle'} me-2"></i>
    ${message}
  `;

  document.body.appendChild(alert);
  setTimeout(() => alert.remove(), 3000);
};

// 生命周期钩子
onMounted(() => {
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeOut {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(-20px); }
    }
  `;
  document.head.appendChild(style);
});
</script>

<style scoped>
/* 全局布局样式 */
.container-fluid {
  padding: 0;
}

.content {
  flex: 1;
  padding: 30px;
  background: #f5f7fa;
  overflow-y: auto;
}

/* 检测容器 */
.detection-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.input-section,
.result-section {
  flex: 1;
}

.example-section {
  margin-top: 20px;
  grid-column: span 2;
}

/* 卡片样式 */
.card {
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.card-header {
  border-radius: 12px 12px 0 0 !important;
  font-weight: 600;
}

/* 文本输入区域 */
textarea {
  width: 100%;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #ddd;
  height: 200px;
  font-size: 16px;
  resize: vertical;
  box-sizing: border-box;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}

textarea:focus {
  outline: none;
  border-color: #3b87d8;
  box-shadow: 0 0 0 3px rgba(59, 135, 216, 0.1);
}

/* 文件上传区域 */
.upload-area {
  border: 2px dashed #ddd;
  padding: 15px;
  text-align: center;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
  margin-bottom: 10px;
}

.upload-area:hover {
  border-color: #3b87d8;
  background-color: rgba(59, 135, 216, 0.05);
}

.upload-icon {
  font-size: 36px;
  color: #bbb;
  margin-bottom: 10px;
  transition: color 0.3s;
}

.upload-hint {
  font-size: 14px;
  color: #999;
  margin: 5px 0;
}

/* 上传预览区域 */
.upload-preview {
  width: 100%;
  text-align: center;
}

.image-preview {
  position: relative;
  display: inline-block;
}

.preview-img {
  max-width: 150px;
  max-height: 150px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid #eee;
}

.clear-btn {
  position: absolute;
  top: 5px;
  right: 5px;
  background: rgba(255, 255, 255, 0.85);
  color: #ff6b6b;
  border: none;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  z-index: 10;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.clear-btn:hover {
  background: #ff6b6b;
  color: white;
}

.file-info {
  margin-top: 10px;
  text-align: center;
  font-size: 14px;
}

/* 结果区域样式 */
.result-placeholder,
.result-loading {
  padding: 30px 20px;
  border-radius: 8px;
  min-height: 180px;
  text-align: center;
  color: #6c757d;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.result-content {
  padding: 10px;
}

.result-icon {
  font-size: 50px;
  text-align: center;
}

.ms-3 {
  text-align: center;
  margin-left: 0;
}

.mb-1 {
  font-size: 30px;
}

.confidence-meter {
  height: 20px;
  background: #f0f0f0;
  border-radius: 10px;
  margin: 10px 0 0;
  overflow: hidden;
  position: relative;
}

.confidence-fill {
  height: 100%;
  border-radius: 10px;
  background: linear-gradient(to right, #ff6b6b, #ffcc00, #8cbf75);
  transition: width 0.8s ease-in-out;
}

.confidence-label {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  text-align: center;
  color: white;
  font-weight: bold;
  line-height: 20px;
}

/* 结果详情样式 */
.result-details {
  background-color: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  margin-top: 25px;
  border: 1px solid #eaeaea;
}

.detail-item {
  display: flex;
  margin-bottom: 12px;
  align-items: flex-start;
}

.detail-label {
  font-weight: 600;
  color: #495057;
  min-width: 100px;
  flex-shrink: 0;
  font-size: 20px;
}

.detail-value {
  color: #212529;
  font-weight: 500;
  word-break: break-word;
  font-size: 20px;
}

/* 风险等级样式 */
.risk-level {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: capitalize;
}

.risk-high {
  background-color: #ffcccc;
  color: #dc3545;
}

.risk-medium {
  background-color: #fff3cd;
  color: #856404;
}

.risk-low {
  background-color: #d4edda;
  color: #155724;
}

.risk-unknown {
  background-color: #e2e3e5;
  color: #383d41;
}

/* 样例容器 */
.examples-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}

/* 样例项 */
.example-item {
  border: 1px solid #eaeaea;
  border-radius: 8px;
  padding: 15px;
  background: #fff;
  transition: all 0.3s ease;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}

.example-item:hover {
  transform: translateY(-5px);
}

/* 样例头部 */
.example-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.example-header h6 {
  margin: 0;
  font-weight: bold;
  flex: 1;
  color: #3b87d8;
}

.example-header button {
  flex-shrink: 0;
  margin-left: 10px;
}

/* 样例内容 */
.example-content {
  max-height: 150px;
  overflow-y: auto;
  font-size: 14px;
  color: #666;
  line-height: 1.5;
  position: relative;
}

/* 滚动条样式 */
.example-content::-webkit-scrollbar {
  width: 6px;
}

.example-content::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.example-content::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.example-content::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 响应式设计 */
@media (max-width: 992px) {
  .detection-container {
    grid-template-columns: 1fr;
  }

  .input-section,
  .result-section {
    width: 100%;
  }

  .example-section {
    grid-column: span 1;
  }

  textarea {
    min-height: 180px;
  }

  .upload-area {
    min-height: 100px;
  }
}

@media (max-width: 768px) {
  .examples-container {
    grid-template-columns: 1fr;
  }
}
</style>