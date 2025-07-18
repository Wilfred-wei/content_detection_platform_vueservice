# 内容检测平台 - 项目结构

## 📁 项目概览

本项目采用Vue前端 + 微服务后端架构，包含以下主要组件：

- **API网关** (端口: 8000) - 统一入口和请求路由
- **4个微服务** (端口: 8001-8004) - 独立的检测服务
- **Vue前端** (Vite + TypeScript) - 用户界面
- **共享组件** - 通用工具和模型

## 🏗️ 目录结构

```
content_detection_platform/
├── 📚 docs/                           # 项目文档
│   ├── API.md                         # API接口文档
│   └── DEPLOYMENT.md                  # 部署指南
├── 🌐 frontend/                       # Vue.js前端项目
│   ├── src/                           # 源代码
│   │   ├── api/                       # API调用封装
│   │   ├── components/                # Vue组件
│   │   ├── router/                    # 路由配置
│   │   ├── types/                     # TypeScript类型定义
│   │   └── views/                     # 页面视图
│   ├── public/                        # 静态资源
│   ├── package.json                   # 前端依赖配置
│   ├── vite.config.ts                 # Vite构建配置
│   └── start.bat                      # Windows启动脚本
├── 🚪 gateway/                        # API网关服务 (8000端口)
│   ├── app.py                         # Flask应用入口
│   ├── routes.py                      # 路由定义
│   ├── config.py                      # 配置文件
│   ├── requirements.txt               # Python依赖
│   └── uploads/                       # 文件上传目录
├── 🔧 services/                       # 微服务集合
│   ├── 📰 rumor_detection/            # 图文谣言检测 (8001端口)
│   │   ├── app.py                     # 服务入口
│   │   ├── services.py                # 业务逻辑
│   │   ├── models.py                  # 数据模型
│   │   ├── config.py                  # 配置文件
│   │   ├── requirements.txt           # 依赖管理
│   │   └── uploads/                   # 上传目录
│   ├── 🤖 ai_image_detection/         # AI图像检测 (8002端口)
│   │   ├── app.py                     # 服务入口
│   │   ├── services.py                # AI检测逻辑
│   │   ├── models.py                  # 数据模型
│   │   ├── config.py                  # 配置文件
│   │   ├── requirements.txt           # 依赖管理
│   │   └── uploads/                   # 上传目录
│   ├── 🎬 video_analysis_module1/     # 视频质量分析 (8003端口)
│   │   ├── app.py                     # 服务入口
│   │   ├── services.py                # 分析逻辑
│   │   ├── models.py                  # 数据模型
│   │   ├── config.py                  # 配置文件
│   │   ├── requirements.txt           # 依赖管理
│   │   └── uploads/                   # 上传目录
│   └── 🎯 video_analysis_module2/     # 视频安全检测 (8004端口)
│       ├── app.py                     # 服务入口（占位符实现）
│       ├── config.py                  # 配置文件
│       ├── requirements.txt           # 依赖管理
│       └── uploads/                   # 上传目录
├── 📦 shared/                         # 共享组件
│   ├── __init__.py                    # Python包初始化
│   ├── exceptions.py                  # 通用异常类
│   ├── response_models.py             # 响应模型
│   └── utils.py                       # 工具函数
├── 🚀 scripts/                        # 启动和管理脚本
│   ├── start_all.py                   # 一键启动所有服务
│   └── start_service.py               # 单独启动指定服务
├── 📋 PROJECT_STRUCTURE.md            # 本文档
├── 📖 README.md                       # 项目说明
└── 🚫 .gitignore                      # Git忽略规则

```

## 🎯 服务状态

| 服务名称 | 端口 | 状态 | 功能描述 |
|----------|------|------|----------|
| **API网关** | 8000 | ✅ 完成 | 统一入口，请求路由，文件转发 |
| **图文谣言检测** | 8001 | ✅ 完成 | 基于NLP的智能谣言识别 |
| **AI图像检测** | 8002 | ✅ 完成 | AI生成图像检测算法 |
| **视频分析模块1** | 8003 | 🚧 框架 | 视频质量分析框架 |
| **视频分析模块2** | 8004 | 🔧 占位符 | 视频安全检测（后续开发） |

## 🚀 快速开始

### 启动所有服务
```bash
python scripts/start_all.py
```

### 启动前端
```bash
cd frontend
npm install
npm run dev
```

### 验证服务
```bash
curl http://localhost:8000/services/status
```

## 📊 项目统计

- **总文件数**: ~2380个文件
- **代码行数**: 约15,000行
- **服务数量**: 5个 (1个网关 + 4个微服务)
- **编程语言**: Python (后端), TypeScript/Vue (前端)

## 🧹 清理历史

项目经过了全面的清理，删除了以下不必要的内容：

### 已删除的内容
- ❌ Django后端应用 (`backend/` 目录)
- ❌ 重复的静态文件和Bootstrap库
- ❌ 临时测试文件和脚本
- ❌ 系统缓存文件 (`__pycache__`, `.DS_Store`)
- ❌ 空目录和备份文件
- ❌ 第三方库的开发文件

### 保留的内容
- ✅ 微服务架构完整保留
- ✅ Vue前端项目完整保留
- ✅ 项目文档和配置文件
- ✅ 启动脚本和管理工具

## 📝 开发指南

### 添加新服务
1. 在 `services/` 下创建新目录
2. 按照现有服务结构创建文件
3. 更新 `gateway/routes.py` 添加路由
4. 更新启动脚本配置

### 前端开发
- 使用 `npm run dev` 开发模式
- API调用统一通过 `src/api/index.ts`
- 新页面添加到 `src/views/`
- 通用组件放在 `src/components/`

### 部署上线
- 参考 `docs/DEPLOYMENT.md`
- 使用 `scripts/start_all.py` 生产启动
- 配置Nginx反向代理
- 使用PM2管理进程

## 🔮 未来规划

- [ ] 完善视频分析模块的真实实现
- [ ] 添加数据库支持 (PostgreSQL/MySQL)
- [ ] 实现服务监控和告警
- [ ] 容器化部署 (Docker + Kubernetes)
- [ ] 添加API限流和缓存
- [ ] 完善测试覆盖率

---

最后更新: 2025年7月1日 