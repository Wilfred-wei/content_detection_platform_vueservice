# 视频分析服务前后端对接总结

## 📋 概览

视频分析服务现已完成与整个项目的对接，包含两个主要模块：
- **Module1**: 视频谣言检测
- **Module2**: 视频语义理解

## 🏗️ 架构对接

### 1. 服务架构
```
Frontend (Vue3) → Gateway (Flask) → Video Analysis Service (Flask)
     ↓                ↓                        ↓
   Port 5173       Port 8000               Port 8003
```

### 2. 关键修改

#### Gateway层 (`gateway/`)
- **config.py**: 统一了视频分析服务配置，从分离的module1/module2改为单一服务
- **routes.py**: 添加了完整的API代理路由：
  - 单文件上传: `/api/v1/video-analysis/module{1,2}/upload`
  - 批量上传: `/api/v1/video-analysis/module{1,2}/uploads`
  - 历史记录: `/api/v1/video-analysis/module{1,2}/history`
  - 静态文件: `/api/v1/video-analysis/static/videos/<filename>`

#### 视频分析服务 (`services/video_analysis/`)
- **app.py**: 
  - 添加了静态视频文件服务 `/static/videos/<filename>`
  - 添加了健康检查端点 `/health`
- **start_service.py**: 新增服务启动脚本，包含依赖检查和目录初始化
- **start_video_analysis.bat**: Windows启动脚本
- **routes.py**: 修复了语法错误

#### 前端层 (`frontend/`)
- **src/api/index.ts**: 更新了videoAPI，使用Gateway路由
- **src/api/videoAPI.js**: 新增专用视频API模块
- **vite.config.ts**: 已配置代理转发

## 🔌 API端点对接

### 通过Gateway的标准API路由

| 功能 | 方法 | Gateway路由 | 实际服务端点 |
|------|------|-------------|--------------|
| Module1 单文件上传 | POST | `/api/v1/video-analysis/module1/upload` | `/video_analysis/module1/upload` |
| Module1 批量上传 | POST | `/api/v1/video-analysis/module1/uploads` | `/video_analysis/module1/uploads` |
| Module1 历史记录 | GET | `/api/v1/video-analysis/module1/history` | `/video_analysis/module1/history` |
| Module1 记录详情 | GET | `/api/v1/video-analysis/module1/history/{id}` | `/video_analysis/module1/history/{id}` |
| Module1 删除记录 | DELETE | `/api/v1/video-analysis/module1/history/{id}` | `/video_analysis/module1/history/{id}` |
| Module1 删除所有 | DELETE | `/api/v1/video-analysis/module1/history` | `/video_analysis/module1/history` |
| Module2 相同模式 | - | `/api/v1/video-analysis/module2/*` | `/video_analysis/module2/*` |
| 示例视频 | GET | `/api/v1/video-analysis/static/videos/{filename}` | `/static/videos/{filename}` |

### 服务状态检查
- **健康检查**: `/health` → 返回服务状态信息

## 📁 文件结构

```
services/video_analysis/
├── app.py                      # 主应用文件 (已修改)
├── config.py                   # 配置文件
├── start_service.py            # 启动脚本 (新增)
├── start_video_analysis.bat    # Windows启动 (新增)
├── requirements.txt            # 依赖列表
├── module1/                    # 视频谣言检测
│   ├── routes.py              # 路由 (修复语法错误)
│   └── services.py            # 业务逻辑
├── module2/                    # 视频语义理解
│   ├── routes.py              # 路由 (修复语法错误)
│   └── services.py            # 业务逻辑
└── temp_data/                  # 数据存储
```

## 🚀 启动说明

### 方式1: Python脚本启动
```bash
cd services/video_analysis
python start_service.py
```

### 方式2: Windows批处理启动
```cmd
cd services\video_analysis
start_video_analysis.bat
```

### 方式3: 直接启动
```bash
cd services/video_analysis
python app.py
```

## ✅ 对接验证

### 1. 服务层验证
- [x] Flask应用正常启动 (端口8003)
- [x] 路由语法错误已修复
- [x] 静态文件服务已配置
- [x] 健康检查端点已添加

### 2. Gateway层验证
- [x] 服务配置已统一
- [x] API代理路由已完整配置
- [x] 文件上传转发已实现

### 3. 前端层验证
- [x] API调用接口已更新
- [x] Vite代理已配置
- [x] 专用API模块已创建

## 🔧 使用示例

### 前端Vue组件调用 (推荐)
```javascript
import { module1API, module2API } from '@/api/videoAPI.js'

// 使用Module1进行视频谣言检测
const result = await module1API.uploadSingle(videoFile)

// 使用Module2进行视频语义理解
const result = await module2API.uploadSingle(videoFile)

// 获取历史记录
const history = await module1API.getHistory()
```

### 直接API调用
```javascript
import { videoAPI } from '@/api/index.ts'

// 标准API调用
const result = await videoAPI.uploadSingle(1, videoFile)
```

## 🛠️ 故障排除

### 常见问题
1. **端口冲突**: 确保8003端口未被占用
2. **依赖缺失**: 运行 `pip install -r requirements.txt`
3. **路径问题**: 确保示例视频文件在 `frontend/public/static/videos/`
4. **CORS问题**: 已配置Flask-CORS，应无跨域问题

### 调试命令
```bash
# 检查服务状态
curl http://localhost:8003/health

# 检查Gateway转发
curl http://localhost:8000/api/v1/video-analysis/module1/history

# 测试示例视频
curl http://localhost:8003/static/videos/example3_2_1_T.mp4
```

## 📝 注意事项

1. **示例视频**: 确保示例视频文件存在于正确路径
2. **依赖安装**: videollama相关依赖可能需要GPU支持
3. **性能考虑**: 视频分析任务可能需要较长时间，已设置120秒超时
4. **存储管理**: 定期清理temp_uploads和temp_data目录

---

**状态**: ✅ 对接完成，等待依赖安装和测试验证 