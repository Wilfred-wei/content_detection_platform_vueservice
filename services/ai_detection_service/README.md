# AI检测服务

## 概述

这是一个独立的AI图像检测服务，基于AIDE_Django项目中的SAFE模型实现。该服务提供了完整的AI生成图像检测功能，包括单张检测、批量检测和热力图生成。

## 功能特性

- ✅ **单张图像检测**: 检测单张图像是否为AI生成
- ✅ **批量检测**: 支持ZIP文件和多文件上传的批量检测
- ✅ **热力图生成**: 为AI生成图像生成热力图
- ✅ **多格式支持**: 支持PNG、JPG、JPEG格式
- ✅ **实时API**: 基于Flask的RESTful API
- ✅ **SAFE模型**: 使用先进的SAFE算法进行检测

## 环境要求

- Python 3.8+
- PyTorch 2.0+
- OpenCV
- Flask

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 启动服务

**Windows:**
```bash
start.bat
```

**Linux/Mac:**
```bash
python app.py
```

### 3. 测试服务

访问健康检查端点：
```
GET http://localhost:8002/health
```

## API文档

### 健康检查
```
GET /health
```

### 单张图像检测
```
POST /detect
Content-Type: multipart/form-data

参数:
- image: 图像文件

响应:
{
  "prediction": "fake|real",
  "confidence": 0.95,
  "processing_time": 2.3,
  "model_version": "SAFE-v2.1.0",
  "image_info": {
    "width": 512,
    "height": 512,
    "format": "JPEG",
    "size": "245.6 KB"
  },
  "heatmap_url": "/heatmap/xxx.jpg"  // 仅AI图像
}
```

### 批量检测
```
POST /detect/batch
Content-Type: multipart/form-data

参数:
- zip_file: ZIP压缩文件 (ZIP上传方式)
- images: 多个图像文件 (多文件上传方式)  
- name: 任务名称 (可选)

响应:
{
  "id": "job-uuid",
  "name": "批量任务_20240101_120000",
  "status": "completed",
  "total_images": 10,
  "processed_images": 10,
  "real_count": 6,
  "ai_count": 4,
  "success_count": 10,
  "failed_count": 0,
  "created_at": "2024-01-01T12:00:00Z",
  "results": [...]
}
```

## 模型信息

- **模型类型**: SAFE (Spectral Analysis for Forgery Examination)
- **架构**: ResNet-based
- **输入尺寸**: 256x256
- **检测类别**: Real vs Fake
- **模型版本**: v2.1.0

## 技术架构

```
services/ai_detection_service/
├── app.py                 # Flask应用主文件
├── safe_model.py         # SAFE模型实现
├── heatmap_generator.py  # 热力图生成器
├── config.py            # 配置文件
├── requirements.txt     # Python依赖
├── start.bat           # Windows启动脚本
└── README.md           # 说明文档
```

## 配置说明

在 `config.py` 中可以修改以下配置：

- `MODEL_PATH`: SAFE模型路径
- `DEVICE`: 计算设备 (cpu/cuda)
- `MAX_FILE_SIZE`: 最大文件大小
- `MAX_BATCH_SIZE`: 批量检测最大文件数
- `HOST`/`PORT`: 服务地址和端口

## 前端集成

Vue前端项目已经集成了该服务：

1. 单张检测调用: `http://localhost:8002/detect`
2. 批量检测调用: `http://localhost:8002/detect/batch`
3. 服务状态检查: `http://localhost:8002/health`

## 故障排除

### 1. 模型加载失败
- 检查 `MODEL_PATH` 配置是否正确
- 确认模型权重文件存在: `checkpoint-best.pth`

### 2. GPU支持
- 安装CUDA版本的PyTorch
- 设置 `Config.DEVICE = 'cuda'`

### 3. 依赖问题
- 确保所有依赖包正确安装
- 使用虚拟环境避免版本冲突

## 性能优化

1. **GPU加速**: 使用CUDA提高检测速度
2. **批量处理**: 对大量图像使用批量检测
3. **模型量化**: 在资源受限环境下可以考虑模型量化

## 开发说明

该服务是从AIDE_Django项目迁移而来，保持了原有的算法精度和功能特性，同时提供了更清晰的API接口和更好的扩展性。 