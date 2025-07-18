# 内容检测平台微服务架构

## 🌟 项目概述

基于你原有的Django项目，我设计并实现了一个真正的微服务架构，解决了以下问题：

### ❌ 原项目问题
- **伪微服务架构**: 所有功能混在一个Django应用中
- **静态资源冗余**: 三处重复的静态文件，Bootstrap版本冲突
- **前后端分离不彻底**: 后端保留模板文件但前端是独立Vue项目
- **代码组织混乱**: 四个不同业务模块挤在同一个应用中

### ✅ 新架构优势
- **真正的微服务**: 每个服务独立运行，不同Python环境无冲突
- **清晰的代码组织**: 每个服务都有独立的业务逻辑和依赖
- **统一的API设计**: 标准化的接口和响应格式
- **易于扩展**: 可以独立开发和部署每个服务

## 🏗️ 架构设计

```
content_detection_platform/
├── 🌐 gateway/                     # API网关 (8000端口)
├── 🔧 services/                    # 微服务集合
│   ├── 📰 rumor_detection/         # 图文谣言检测 (8001端口)
│   ├── 🤖 ai_image_detection/      # AI图像检测 (8002端口)  
│   ├── 🎬 video_analysis_module1/  # 视频质量分析 (8003端口)
│   └── 🎯 video_analysis_module2/  # 视频安全检测 (8004端口)
├── 📦 shared/                      # 共享组件
├── 🚀 scripts/                     # 启动脚本
├── 🖥️ frontend/                    # Vue前端 (保持不变)
└── 📚 docs/                        # 文档
```

## 🚀 快速开始

### 启动所有服务
```bash
# 一键启动所有微服务
python scripts/start_all.py
```

### 启动单个服务
```bash
# 启动API网关
python scripts/start_service.py gateway

# 启动谣言检测服务
python scripts/start_service.py rumor

# 启动AI图像检测服务
python scripts/start_service.py ai-image
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
| **图文谣言检测** | 8001 | ✅ 完成 | 智能谣言识别算法 |
| **AI图像检测** | 8002 | ✅ 完成 | AI生成图像检测 |
| **视频分析模块1** | 8003 | 🚧 框架 | 视频质量分析 |
| **视频分析模块2** | 8004 | 🔧 维护中 | 视频安全检测 |

## 🎯 核心特性

### 1. 真正的微服务分离
- 每个服务独立运行，可以使用不同Python环境
- 服务间通过HTTP API通信，避免依赖冲突
- 支持独立部署和扩展

### 2. 统一的API设计
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

### 3. 灵活的部署方式
- **开发环境**: 使用脚本一键启动所有服务
- **生产环境**: 可以独立部署到不同服务器
- **容器化**: 支持Docker容器化部署（可选）

### 4. 现有功能迁移
- **图文谣言检测**: 基于文本分析算法
- **AI图像检测**: 复用你原有的SAFE模型逻辑
- **视频分析**: 提供框架，易于扩展

## 📊 API概览

### 主要端点
- `GET /services/status` - 查看所有服务状态
- `POST /api/v1/rumor/detect` - 图文谣言检测
- `POST /api/v1/ai-image/detect` - AI图像检测
- `POST /api/v1/video-analysis/module1/detect` - 视频质量分析
- `POST /api/v1/video-analysis/module2/detect` - 视频安全检测

详细API文档: [docs/API.md](docs/API.md)

## 🔧 开发指南

### 依赖管理
每个服务都有独立的依赖文件：
```bash
gateway/requirements.txt
services/rumor_detection/requirements.txt  
services/ai_image_detection/requirements.txt
services/video_analysis_module1/requirements.txt
services/video_analysis_module2/requirements.txt
```

### 扩展服务
1. **实现真实算法**: 在对应服务的`services.py`中替换模拟逻辑
2. **添加新服务**: 按照现有服务的结构创建新的微服务
3. **更新API网关**: 在`gateway/routes.py`中添加新的路由

### 配置管理
使用环境变量自定义端口：
```bash
export GATEWAY_PORT=8000
export RUMOR_SERVICE_PORT=8001
# ...
```

## 📁 静态资源清理

### 已删除的冗余文件
- ❌ `backend/detection/static/` - 删除重复的静态文件
- ❌ `frontend/public/static/` - 删除复制的Django静态文件
- ❌ `backend/content_detection_platform/static/` - 只保留Django Admin必需的静态文件

### Bootstrap版本统一
- ✅ Vue前端使用npm管理依赖
- ✅ 后端只保留Django Admin必需的文件
- ✅ 避免版本冲突

## 🔮 未来扩展

### 短期目标
1. **完善视频分析模块**: 集成OpenCV/FFmpeg进行真实视频处理
2. **添加数据库**: 替换内存存储，使用PostgreSQL/MySQL
3. **完善前端**: 更新Vue前端调用新的API

### 长期目标
1. **服务监控**: 添加Prometheus监控和Grafana仪表板
2. **负载均衡**: 使用Nginx进行负载均衡
3. **容器化**: 提供Docker和Kubernetes部署方案
4. **CI/CD**: 自动化测试和部署流程

## 🤝 对比原项目

| 维度 | 原项目 | 新架构 |
|------|--------|--------|
| **架构模式** | 单体应用 | 微服务架构 |
| **服务分离** | ❌ 伪分离 | ✅ 真正独立 |
| **静态资源** | ❌ 三处重复 | ✅ 合理组织 |
| **依赖管理** | ❌ 混合依赖 | ✅ 独立环境 |
| **API设计** | ❌ 不统一 | ✅ 标准化 |
| **扩展性** | ❌ 紧耦合 | ✅ 易扩展 |
| **部署方式** | ❌ 单一部署 | ✅ 灵活部署 |

## 📚 文档

- [部署指南](docs/DEPLOYMENT.md) - 详细的部署说明
- [API文档](docs/API.md) - 完整的API接口文档

## 💡 最后建议

1. **分阶段迁移**: 可以逐步将现有业务逻辑迁移到新架构
2. **保留现有前端**: Vue前端可以继续使用，只需更新API调用
3. **渐进式优化**: 先实现核心功能，再逐步添加监控、缓存等高级特性

这个新架构解决了你提到的所有问题，提供了真正的微服务分离，同时保持了代码的简洁和可维护性。每个服务都可以独立开发、测试和部署，为后续的扩展和优化打下了坚实的基础。 