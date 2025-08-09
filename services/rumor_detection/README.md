# C3N 图文谣言检测服务

## 概述

本服务基于C3N（Cross-modal Consistency Constraint Network）模型实现图文谣言检测功能。C3N模型通过融合文本和图像信息，利用跨模态一致性约束来检测谣言。

## 主要特性

- **多模态融合**: 结合文本和图像信息进行谣言检测
- **中文CLIP支持**: 使用中文CLIP模型进行特征提取
- **Transformer架构**: 采用Transformer编码器进行跨模态交互
- **目标检测集成**: 预留目标检测接口，可提取图像中的目标区域
- **实时推理**: 支持同步和异步推理模式

## 文件结构

```
rumor_detection/
├── app.py                    # Flask应用主文件
├── services.py               # 业务逻辑服务
├── C3N_models.py            # C3N模型定义
├── object_detection_model.py # 目标检测模型预留接口
├── data_loader.py            # 数据加载器
├── train_eval_helper.py      # 训练和评估辅助函数
├── models.py                 # 数据模型定义
├── config.py                 # 配置文件
├── requirements.txt          # 依赖包列表
├── C3N_models.pt            # 预训练模型权重
├── pretrained_models/        # 预训练模型目录
└── uploads/                  # 上传文件目录
```

## 模型架构

### C3N模型组件

1. **中文CLIP编码器**: 提取文本和图像特征
2. **Transformer编码器**: 实现跨模态交互
3. **相似度计算模块**: 计算文本-图像相似度
4. **融合分类器**: 最终谣言检测分类

### 目标检测集成

- **YOLO集成**: 已集成ultralytics YOLOv8模型
- **自动目标检测**: 自动检测图像中的目标对象
- **图像块提取**: 根据检测结果提取目标区域
- **预训练模型**: 使用YOLOv8n预训练权重，首次运行自动下载

## API接口

### 1. 健康检查
```
GET /health
```

### 2. 谣言检测
```
POST /detect
Content-Type: multipart/form-data

参数:
- content: 文本内容
- image: 图片文件
```

### 3. 获取检测结果
```
GET /result/<task_id>
```

### 4. 服务统计
```
GET /stats
```

## 安装和运行

### 1. 安装依赖
```bash
pip install -r requirements.txt
```

### 2. 下载预训练模型
```bash
# 创建预训练模型目录
mkdir -p pretrained_models/cn-clip
mkdir -p pretrained_models/clip

# 中文CLIP模型和YOLO模型将在首次运行时自动下载
# YOLOv8n 模型约 6MB，会自动下载到 ~/.ultralytics/
```

### 3. 运行服务
```bash
python app.py
```

## 配置说明

### 模型参数
- `crop_num`: 图像块数量 (默认: 6)
- `st_num`: 句子数量 (默认: 31)
- `layer_num`: Transformer层数 (默认: 8)
- `conv_kernel`: 卷积核大小 (默认: [1, 2, 3])

### 目标检测配置
- `enabled`: 是否启用目标检测 (默认: True)
- `model_type`: 目标检测模型类型 ('yolo')
- `model_path`: 目标检测模型路径 (默认: 'yolov8n.pt')
- `confidence_threshold`: 置信度阈值 (默认: 0.5)
- `nms_threshold`: NMS阈值 (默认: 0.4)
- `max_patches`: 最大提取的图像块数量 (默认: 5)

## 使用示例

### Python客户端示例
```python
import requests

# 检测谣言
with open('test_image.jpg', 'rb') as f:
    files = {'image': f}
    data = {'content': '这是一条测试文本'}
    response = requests.post('http://localhost:5001/detect', 
                           files=files, data=data)
    result = response.json()
    print(f"检测结果: {result}")
```

### cURL示例
```bash
curl -X POST http://localhost:5001/detect \
  -F "content=这是一条测试文本" \
  -F "image=@test_image.jpg"
```

## 模型训练

### 数据准备
1. 准备训练数据（文本+图像）
2. 数据预处理和特征提取
3. 配置训练参数

### 训练命令
```bash
python train.py --dataset weibo --epochs 30 --batch_size 16
```

## 测试和验证

### 测试命令
```bash
# 测试YOLO目标检测功能
python test_yolo.py

# 运行完整服务测试
python test_service.py

# 运行使用示例
python example_usage.py
```

## 注意事项

1. **GPU要求**: 建议使用GPU进行推理，CPU模式较慢
2. **内存要求**: 模型较大，建议至少8GB内存
3. **模型文件**: 确保C3N_models.pt文件存在
4. **目标检测**: 已集成YOLO目标检测，首次运行会自动下载YOLOv8n模型

## 故障排除

### 常见问题

1. **模型加载失败**
   - 检查C3N_models.pt文件是否存在
   - 确认模型文件路径正确

2. **CUDA内存不足**
   - 减少batch_size
   - 使用CPU模式

3. **依赖包安装失败**
   - 检查Python版本兼容性
   - 使用conda环境

## 更新日志

### v2.0 (当前版本)
- 集成真实C3N模型
- 添加目标检测预留接口
- 优化文本预处理
- 改进错误处理

### v1.0
- 基础谣言检测功能
- 简化模型实现

## 贡献

欢迎提交Issue和Pull Request来改进这个服务。

## 许可证

本项目采用MIT许可证。
