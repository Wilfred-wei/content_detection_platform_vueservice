# 内容检测平台微服务部署指南

## 🏗️ 架构概览

本项目采用微服务架构，包含以下服务：

- **API网关** (端口: 8000) - 统一入口，负责请求路由
- **图文谣言检测服务** (端口: 8001) - 检测文本内容是否为谣言
- **AI图像检测服务** (端口: 8002) - 检测图像是否为AI生成
- **视频分析模块1** (端口: 8003) - 视频内容质量分析 (框架)
- **视频分析模块2** (端口: 8004) - 视频内容安全检测 (维护中)

## 🚀 快速启动

### 方式一：启动所有服务
```bash
# 进入项目根目录
cd content_detection_platform

# 启动所有微服务
python scripts/start_all.py
```

### 方式二：单独启动服务
```bash
# 查看可用服务
python scripts/start_service.py --list

# 启动API网关
python scripts/start_service.py gateway

# 启动图文谣言检测服务
python scripts/start_service.py rumor_detection

# 启动AI图像检测服务
python scripts/start_service.py ai_image_detection

# 启动视频分析模块1
python scripts/start_service.py video_analysis_module1

# 启动视频分析模块2
python scripts/start_service.py video_analysis_module2
```

### 方式三：手动启动
```bash
# 启动API网关
cd gateway
python app.py

# 启动图文谣言检测服务 (新终端)
cd services/rumor_detection
python app.py

# 启动AI图像检测服务 (新终端)
cd services/ai_image_detection
python app.py

# 其他服务类似...
```

## 📦 依赖安装

每个服务都有独立的依赖文件，可以创建不同的Python环境：

```bash
# 为每个服务创建虚拟环境
python -m venv gateway_env
python -m venv rumor_env
python -m venv ai_image_env
python -m venv video1_env
python -m venv video2_env

# 激活环境并安装依赖
# Windows
gateway_env\Scripts\activate
pip install -r gateway/requirements.txt

# Linux/Mac
source gateway_env/bin/activate
pip install -r gateway/requirements.txt
```

## 🔧 环境变量配置

你可以通过环境变量自定义服务端口：

```bash
export GATEWAY_PORT=8000
export RUMOR_SERVICE_PORT=8001
export AI_IMAGE_SERVICE_PORT=8002
export VIDEO_MODULE1_PORT=8003
export VIDEO_MODULE2_PORT=8004
```

## 🌐 API访问

### 主要端点

- **服务状态检查**: `GET http://localhost:8000/services/status`
- **图文谣言检测**: `POST http://localhost:8000/api/v1/rumor/detect`
- **AI图像检测**: `POST http://localhost:8000/api/v1/ai-image/detect`
- **视频分析模块1**: `POST http://localhost:8000/api/v1/video-analysis/module1/detect`
- **视频分析模块2**: `POST http://localhost:8000/api/v1/video-analysis/module2/detect`

### 健康检查

每个服务都提供健康检查端点：

```bash
curl http://localhost:8000/health   # API网关
curl http://localhost:8001/health   # 图文谣言检测
curl http://localhost:8002/health   # AI图像检测
curl http://localhost:8003/health   # 视频分析模块1
curl http://localhost:8004/health   # 视频分析模块2
```

## 🔍 监控和调试

### 服务日志

每个服务启动时会在控制台输出日志，包括：
- 服务启动信息
- 请求处理日志
- 错误信息

### 服务状态

访问 `http://localhost:8000/services/status` 查看所有服务的健康状态。

## 🚧 开发注意事项

### 框架服务

以下服务目前只是框架实现：
- **视频分析模块1**: 提供基本框架，模拟分析结果
- **视频分析模块2**: 维护中状态，返回维护信息

### 扩展开发

要实现真实的业务逻辑：

1. **图文谣言检测**: 在 `services/rumor_detection/services.py` 中实现真实的NLP算法
2. **AI图像检测**: 在 `services/ai_image_detection/services.py` 中集成真实的AI模型
3. **视频分析**: 在相应模块中集成视频处理算法

## 🐛 故障排除

### 端口冲突
如果端口被占用，修改对应的环境变量或配置文件。

### 服务无法启动
1. 检查Python环境和依赖
2. 查看控制台错误信息
3. 确认端口未被占用
4. 检查文件权限

### 服务间通信失败
1. 确认所有服务都正常启动
2. 检查网络连接
3. 查看API网关日志

## 📈 性能优化

### 生产环境建议

1. 使用 Gunicorn 或 uWSGI 部署 Flask 应用
2. 添加 Nginx 作为反向代理
3. 配置负载均衡
4. 使用真实的数据库替代内存存储
5. 添加缓存机制
6. 配置日志管理系统

### 监控建议

1. 添加服务监控 (如 Prometheus)
2. 配置告警系统
3. 实施分布式追踪
4. 性能监控和分析 