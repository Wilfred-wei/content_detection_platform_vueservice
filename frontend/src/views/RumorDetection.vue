<template>
  <div class="page-layout">
    <!-- 侧边栏 -->
    <aside class="layout-sidebar">
      <Sidebar/>
    </aside>

    <!-- 主要内容区域 -->
    <main class="layout-main">
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
                    <div class="text-input-wrapper">
                      <textarea
                          id="text-input"
                          v-model="textInput"
                          placeholder="请输入需要检测的文本内容，或上传文档自动提取..."
                          @input="clearResults"
                      ></textarea>
                      <!-- 文档上传按钮 -->
                      <div class="document-upload">
                        <label for="doc-input" class="doc-upload-btn">
                          <i class="fas fa-file-upload"></i>
                          上传文档
                        </label>
                        <input
                            id="doc-input"
                            ref="docInput"
                            accept=".txt,.doc,.docx,.xlsx,.xls,.csv"
                            hidden
                            type="file"
                            @change="handleDocSelected"
                        >
                        <span class="doc-formats-hint">支持 TXT, DOC, DOCX, XLSX, XLS</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label>上传图片：</label>
                    <!-- 上传区域开始 -->
                    <div class="upload-area"
                         :class="{ 'upload-hover': isDragOver }"
                         @dragover.prevent="handleDragOver"
                         @dragleave.prevent="handleDragLeave"
                         @drop.prevent="handleDrop"
                         @click="!selectedFile && fileInput?.click()"> 

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
                          :disabled="false"
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
                  <!-- 检测中状态 -->
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
                          <img v-if="detectionResult.is_rumor" :src="getStaticImagePath('warning.svg')" alt="警告" class="warning-icon" />
                          <span v-else>✅</span>
                        </div>
                        <div class="ms-3">
                          <h5 class="mb-1">{{ detectionResultText }}</h5>
                          <p class="mb-0">
                            置信度: <strong>{{ confidencePercent }}%</strong>
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
                      <img :src="getExampleImagePath('rumor', 'example1.jpg')" alt="example1" style="max-width:50px; max-height:50px">
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
                      <img :src="getExampleImagePath('rumor', 'example2.jpg')" alt="example2" style="max-width:50px; max-height:50px">
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
                      <img :src="getExampleImagePath('rumor', 'example3.jpg')" alt="example3" style="max-width:50px; max-height:50px">
                    </div>
                  </div>

                  <!-- 样例4 -->
                  <div class="example-item">
                    <div class="example-header">
                      <h6>美国食用油价格</h6>
                      <button class="btn btn-sm btn-outline-primary" @click="useExample(3)">
                        点击使用此示例
                      </button>
                    </div>
                    <div class="example-content">
                      <p>
                        #震惊，转发求证：【想都不敢想 ，在美国一桶金龙鱼食用油只要8元人民币...</p>
                      <img :src="getExampleImagePath('rumor', 'example4.jpg')" alt="example4" style="max-width:50px; max-height:50px">
                    </div>
                  </div>

                  <!-- 样例5 -->
                  <div class="example-item">
                    <div class="example-header">
                      <h6>奥迪公司3D打印经典赛车模型</h6>
                      <button class="btn btn-sm btn-outline-primary" @click="useExample(4)">
                        点击使用此示例
                      </button>
                    </div>
                    <div class="example-content">
                      <p>
                        【奥迪公司3D打印1936年C版经典赛车模型】近日，奥迪模具利用3D打印技术按照1:2的比例仿制了Auto Union在1936年推出的C版赛车...</p>
                      <img :src="getExampleImagePath('rumor', 'example5.jpg')" alt="example5" style="max-width:50px; max-height:50px">
                    </div>
                  </div>

                  <!-- 样例6 -->
                  <div class="example-item">
                    <div class="example-header">
                      <h6>育儿补贴免征个人所得税</h6>
                      <button class="btn btn-sm btn-outline-primary" @click="useExample(5)">
                        点击使用此示例
                      </button>
                    </div>
                    <div class="example-content">
                      <p>
                        #育儿补贴免征个人所得税#【转发了解！#育儿补贴标准#】今天，#育儿补贴制度实施方案发布#。《实施方案》明确，建立实施育儿补贴制度...</p>
                      <img :src="getExampleImagePath('rumor', 'example6.jpg')" alt="example6" style="max-width:50px; max-height:50px">
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted} from 'vue'
import Sidebar from '../components/Sidebar.vue'
import {rumorAPI} from '../api'
import { getExampleImagePath, getStaticImagePath } from '../utils/assetPath'

// 类型定义
interface RumorDetectionResult {
  is_rumor: boolean
  confidence: number
  result: string
  created_at: string
  reasoning?: string[]
  sources_checked?: string[]
  risk_level?: string
  probability?: number
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
  return detectionResult.value.is_rumor ? 'rumor' : 'truth'
})

// 图标改为模板中使用图片+字符的形式，保留状态类

// 文件处理方法
const docInput = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

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

// 处理文档上传，提取文本内容
const handleDocSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    const file = input.files[0]
    const fileExt = file.name.split('.').pop()?.toLowerCase()

    try {
      let extractedText = ''

      switch (fileExt) {
        case 'txt':
          extractedText = await readTxtFile(file)
          break
        case 'doc':
        case 'docx':
          extractedText = await readDocFile(file)
          break
        case 'xlsx':
        case 'xls':
        case 'csv':
          extractedText = await readExcelFile(file)
          break
        default:
          errorMessage.value = '不支持的文档格式'
          return
      }

      if (extractedText) {
        textInput.value = extractedText
        errorMessage.value = ''
        showAlert(`文档 "${file.name}" 内容已提取`, 'success')
      } else {
        errorMessage.value = '无法从文档中提取文本内容'
      }
    } catch (error: any) {
      console.error('文档解析失败:', error)
      errorMessage.value = `文档解析失败: ${error.message}`
    }

    // 重置 input 以便允许重复上传同一文件
    input.value = ''
  }
}

// 读取 TXT 文件
const readTxtFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string || '')
    reader.onerror = () => reject(new Error('读取 TXT 文件失败'))
    reader.readAsText(file, 'UTF-8')
  })
}

// 读取 DOC/DOCX 文件
const readDocFile = async (file: File): Promise<string> => {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value || ''
}

// 读取 Excel 文件
const readExcelFile = async (file: File): Promise<string> => {
  const XLSX = await import('xlsx')
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })

  let allText = ''

  // 遍历所有工作表
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

    // 将每行数据转换为文本
    for (const row of jsonData as any[][]) {
      const rowText = row.filter(cell => cell !== null && cell !== undefined).join(' ')
      if (rowText) {
        allText += rowText + '\n'
      }
    }
  }

  return allText.trim()
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

    console.log('API响应:', response)

    if (response.success) {
      detectionResult.value = {
        is_rumor: response.is_rumor,
        confidence: response.confidence,
        result: response.is_rumor ? '谣言' : '非谣言',
        created_at: new Date().toISOString(),
        risk_level: response.result?.risk_level || '未知',
        probability: response.result?.probability ?? 0,
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
    imageUrl: getExampleImagePath('rumor', 'example1.jpg')
  },
  {
    title: "韩国申遗全面溃败",
    text: "韩国申遗全面溃败\n\n韩国非遗翻车大快人心！泡菜祖宗在中国，证据甩脸上还嘴硬？申遗变\"申遗\"（遗臭万年），干脆再申个\"碰瓷非遗\"算了！联合国干得漂亮，建议下次把韩剧\"抄袭中国古装\"也查查。笑死，泡菜菌群检测直接认祖归宗，韩国网友破防现场。要不再申个\"宇宙起源\"吧，反正按他们的逻辑，全宇宙都是韩国的！\n\n韩国5项非遗项目因证据不足面临撤销，泡菜文化、燃灯会、端午祭被列入审查名单。中国提交137项实证，揭露其文化溯源问题。韩国可能需支付2.3亿美元补偿金，并被列入\"文化诚信观察名单\"。网友和学者批评韩国文化断层及申遗材料造假。此前榫卯、儒学书院等申遗也曾引发争议。真正的文化遗产无需\"碰瓷\"，历史自会证明。#韩国申遗全面溃败##热点观点#",
    imageUrl: getExampleImagePath('rumor', 'example2.jpg')
  },
  {
    title: "武汉女孩远嫁非洲后生活艰难",
    text: "#武汉女孩远嫁非洲后生活艰难#说句实在的，每个人选的路，哭着也得走完，这话糙理不糙。就像那位远嫁非洲的武汉女孩，不管当初是被爱情冲昏头，还是对远方有不切实际的幻想，既然做了选择，就得扛住随之而来的难。\n\n生活从不会因为\"我没想到\"就手下留情。远嫁前，哪怕花点时间查查当地的生活习惯、经济水平，问问去过的人，也不至于把日子过得太狼狈。可要是闭着眼往前冲，把婚姻当赌局，那输了就得认。文化差异不是小事，语言不通、饮食不惯、没朋友没依靠，这些难题不会凭空消失，都是当初拍板时没掂量清楚的代价。\n\n有人可能会说\"太狠心\"，但现实就是这么回事。就像有人明知道熬夜伤身体还天天熬，生病了能怪谁？有人借钱炒股想暴富，亏了能赖市场吗？选择和代价从来都是绑在一起的，你选了它的甜，就得接得住它的苦。\n\n当然，说这些不是看笑话，而是想让人明白：做选择时别偷懒，多想想最坏的结果能不能扛。真选错了也别死扛，及时止损也是种本事。但不管怎么说，自己选的路，代价总得自己付------这不是惩罚，是生活教我们长大的学费。",
    imageUrl: getExampleImagePath('rumor', 'example3.jpg')
  },
  {
    title: "美国食用油价格",
    text: "震惊，转发求证：【想都不敢想 ，在美国一桶金龙鱼食用油只要8元人民币】 一桶食用油相当于中国超市40多元(现在估计已经涨到五六十元了)的金龙鱼，在纽约沃尔玛感恩节时是1.6美元，圣诞节降至1.3美元。(折合人民币8.58元，而且油是绿色纯天然的，不是转基因的)，为什么中国一桶食用油要卖几十上百元？",
    imageUrl: getExampleImagePath('rumor', 'example4.jpg')
  },
  {
    title: "奥迪公司3D打印经典赛车模型",
    text: "【奥迪公司3D打印1936年C版经典赛车模型】近日，奥迪模具利用3D打印技术按照1:2的比例仿制了Auto Union在1936年推出的C版赛车，奥迪模具3D打印的这个模具的原型是Silver Arrow，虽然是1：2的比例，看起来比原车型小了一倍，但仍然能够坐下一名司机。其中的所有金属部件都是3D打印而成的。",
    imageUrl: getExampleImagePath('rumor', 'example5.jpg')
  },
  {
    title: "某明星被曝代孕弃养",
    text: "#育儿补贴免征个人所得税#【转发了解！#育儿补贴标准#】今天，#育儿补贴制度实施方案发布#。《实施方案》明确，建立实施育儿补贴制度：①从2025年1月1日起，对符合法律法规规定生育的3周岁以下婴幼儿发放补贴，至其年满3周岁。②育儿补贴按年发放，现阶段国家基础标准为每孩每年3600元。其中，对2025年1月1日之前出生、不满3周岁的婴幼儿，按应补贴月数折算计发补贴。③对按照育儿补贴制度规定发放的育儿补贴免征个人所得税。在最低生活保障对象、特困人员等救助对象认定时，育儿补贴不计入家庭或个人收入。（总台央视记者杨阳 史迎春）",
    imageUrl: getExampleImagePath('rumor', 'example6.jpg')
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

/* 旧样式保持兼容 */
.container-fluid {
  padding: 0;
}

.content-legacy {
  flex: 1;
  padding: 30px;
  background: #f5f7fa;
  /* 移除 overflow-y: auto */
}

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

.card {
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.card-header {
  border-radius: 12px 12px 0 0 !important;
  font-weight: 600;
}

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

/* 文档上传样式 */
.text-input-wrapper {
  position: relative;
}

.document-upload {
  display: flex;
  align-items: center;
  gap: 10px;
}

.doc-upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 14px;
  transition: all 0.3s;
  border: 1px dashed #999;
}

.doc-upload-btn:hover {
  background-color: #3b87d8;
  color: white;
  border-color: #3b87d8;
}

.doc-formats-hint {
  font-size: 12px;
  color: #999;
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

/* 根据谣言/非谣言状态设置颜色 */
.result-icon.rumor {
  color: #dc3545; /* 红色，强调风险 */
}
.result-icon.truth {
  color: #28a745; /* 绿色，对勾 */
}

.warning-icon {
  width: 48px;
  height: 48px;
  display: inline-block;
}

/* 提示框背景和边框颜色 */
.alert.rumor {
  background-color: #ffe6e9;
  border: 1px solid #f5c2c7;
  color: #842029;
}
.alert.truth {
  background-color: #e9f7ef;
  border: 1px solid #badbcc;
  color: #0f5132;
}

.ms-3 {
  text-align: center;
  margin-left: 0 !important;
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

.examples-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}

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

.example-content {
  max-height: 150px;
  overflow-y: auto;
  font-size: 14px;
  color: #666;
  line-height: 1.5;
  position: relative;
}

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