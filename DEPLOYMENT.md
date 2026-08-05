# 环境配置指南

## 系统要求

- Linux/Windows/MacOS
- Python 3.8+
- Node.js 16+
- NVIDIA GPU + CUDA（推荐，用于深度学习模型）

---

## 一、前端环境

### 依赖
- Node.js 16+
- npm

### 安装
```bash
cd frontend
npm install
```

### 运行
```bash
npm run dev    # 开发模式，端口 25173
npm run build  # 构建
```

---

## 二、后端服务

项目采用微服务架构，各服务可独立运行。

### 端口分配
| 服务 | 端口 |
|------|------|
| API网关 | 28000 |
| AI图像检测 | 8002 |
| 图文谣言检测 | 8010 |
| 视频分析 | 28003 |

---

### 1. API网关 (gateway/)

```bash
cd gateway
pip install -r requirements.txt
python app.py
```

**完整依赖** (requirements.txt):
```
Flask==2.3.3
Flask-CORS==4.0.0
requests==2.31.0
Werkzeug==2.3.7
```

---

### 2. AI图像检测服务 (services/ai_detection_service/)

```bash
cd services/ai_detection_service
pip install -r requirements.txt
python app.py
```

**完整依赖** (requirements.txt):
```
Flask>=2.0.0
Flask-CORS>=3.0.10
torch>=1.10.0
torchvision>=0.11.0
Pillow>=9.0.0
opencv-python>=4.5.0
numpy>=1.21.0
Werkzeug==2.3.7
pytorch-wavelets>=1.3.0
PyWavelets>=1.4.1
```

---

### 3. 图文谣言检测服务 (services/rumor_detection/)

```bash
cd services/rumor_detection
pip install -r requirements.txt
python app.py
```

**完整依赖** (requirements.txt):
```
Flask==2.3.3
requests==2.31.0
Werkzeug==2.3.7
torch>=1.9.0
torchvision>=0.10.0
Pillow>=8.0.0
patch_ng
lmdb
cn_clip
transformers>=4.0.0
numpy>=1.19.0
tqdm>=4.60.0
matplotlib>=3.3.0
setproctitle
ultralytics>=8.0.0
opencv-python>=4.5.0
```

**模型文件** (需要自行下载/训练):
- `C3N_models.pt` - 谣言检测模型
- `yolov8n.pt` - YOLO检测模型

---

### 4. 视频分析服务 (services/video_analysis/)

```bash
cd services/video_analysis
pip install -r requirements.txt
python app.py
```

**完整依赖** (requirements.txt):
```
accelerate==1.0.1
Flask==3.0.3
Flask-Cors==5.0.0
torch==2.0.0
torchvision==0.15.1
torchaudio==2.0.0
pytorchvideo==0.1.5
opencv-python==4.12.0.88
decord==0.6.0
transformers==4.37.0
timm==1.0.17
numpy==1.24.1
pandas==2.0.3
pillow==10.2.0
matplotlib==3.7.5
```

---

## 三、启动顺序

1. 启动各后端服务 (可并行)
2. 启动前端

```bash

# 终端2: AI检测
cd services/ai_detection_service && python app.py

# 终端3: 谣言检测
cd services/rumor_detection && python app.py

# 终端4: 视频分析
cd services/video_analysis && python app.py

# 终端5: 前端
cd frontend && npm run dev
```

---

## 四、注意事项

1. **Python虚拟环境**: 建议每个服务使用独立的虚拟环境，避免依赖冲突
2. **GPU加速**: PyTorch需安装对应CUDA版本
3. **模型文件**: 深度学习模型文件较大，需单独下载或训练
4. **端口占用**: 确保配置的端口未被占用
