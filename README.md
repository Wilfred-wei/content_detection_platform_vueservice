# 多模态检测平台微服务架构

## 🌟 项目概述

### ✅ 架构优势
- **分布式服务**: 每个服务独立运行，不同Python环境无冲突
- **清晰的代码组织**: 每个服务都有独立的业务逻辑和依赖
- **统一的API设计**: 标准化的接口和响应格式
- **易于扩展**: 可以独立开发和部署每个服务

## 🏗️ 架构设计

```
content_detection_platform/
├── 🌐 gateway/                     # API网关 (8000端口)
├── 🔧 services/                    # 微服务集合
│   ├── 📰 rumor_detection/         # 图文谣言检测 (8010端口)
│   ├── 🤖 ai_image_detection/      # AI图像检测 (8002端口)  
│   ├── 🎬 video_analysis_module1/  # 视频质量分析 (8003端口)
│   └── 🎯 video_analysis_module2/  # 视频安全检测 (8004端口)
├── 📦 shared/                      # 共享组件
├── 🚀 scripts/                     # 启动脚本
├── 🖥️ frontend/                    # Vue前端
└── 📚 docs/                        # 文档
```

## 🚀 快速开始

### 启动所有服务（建议各模块启动单个服务即可）
```bash
# 一键启动所有微服务
python scripts/start_all.py
```

### 启动单个服务（推荐）
```bash

# 启动谣言检测服务
cd services/rumor_detection
python app.py

# 启动AI图像检测服务
cd services/ai_detection_service
python app.py
```

### 验证服务
```bash
# 检查所有服务状态
curl http://localhost:8000/services/status

# 测试谣言检测
curl -X POST http://localhost:8000/api/v1/rumor/detect \
  -H "Content-Type: application/json" \
  -d '{"content": "这是测试内容"}'
```

## 📋 服务详情

| 服务 | 端口 | 状态 | 功能 |
|------|------|------|------|
| **API网关** | 8000 | ✅ 完成 | 统一入口，请求路由 |
| **图文谣言检测** | 8010 | ✅ 完成 | 图文谣言检测算法 |
| **AI图像检测** | 8002 | ✅ 完成 | AI生成图像检测 |
| **视频分析模块1** | 8003 | 🚧 框架 | XXXXXXXXXX |
| **视频分析模块2** | 8004 | 🔧 维护中 | XXXXXXXX |

## 🎯 核心特性

### 1. 微服务分离
- 每个服务独立运行，可以使用不同Python环境
- 服务间通过HTTP API通信，避免依赖冲突
- 支持独立部署和扩展

### 2. API设计
```json
// 标准响应格式
{
  "success": true,
  "data": {},
  "message": "操作成功", 
  "code": 200,
  "timestamp": "2024-01-01T00:00:00"
}
```

## 📊 API概览

### 主要端点
- `GET /services/status` - 查看所有服务状态
- `POST /api/v1/rumor/detect` - 图文谣言检测
- `POST /api/v1/ai-image/detect` - AI图像检测
- `POST /api/v1/video-analysis/module1/detect` - 视频分析1
- `POST /api/v1/video-analysis/module2/detect` - 视频分析2

详细API文档: [docs/API.md](docs/API.md)

## 🔧 开发指南

### 依赖管理
每个服务都有独立的依赖文件：（独立测试时不需要全部安装）
```bash
gateway/requirements.txt
services/rumor_detection/requirements.txt  
services/ai_image_detection/requirements.txt
services/video_analysis_module1/requirements.txt
services/video_analysis_module2/requirements.txt
```

### 扩展服务步骤（包括但不限于，需要根据各自算法实际情况调整）
1. **实现算法**: 在对应服务的`services.py`中编写算法逻辑
2. **添加新服务**: 按照现有服务的结构创建新的服务（如app.py,config.py等）
3. **更新API网关**: 在`gateway/routes.py`中添加新的路由
4. **更新代理**： 在\frontend\vite.config.ts添加代理机制
5. **确认前端API**： 在\frontend\src\api\index.ts确认



## 📚 文档
- [API文档](docs/API.md) - 完整的API接口文档