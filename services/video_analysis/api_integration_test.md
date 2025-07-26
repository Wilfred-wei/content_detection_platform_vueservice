# 视频分析API集成测试

## 🎯 重构后的架构（严格参考AI图像检测）

### 对比架构

| 功能 | AI图像检测（参考） | 视频分析（新架构） |
|------|------------------|------------------|
| 前端调用 | `/api/v1/ai-image/detect` | `/api/v1/video-analysis/module1/upload` |
| Gateway转发 | `→ http://localhost:8002/detect` | `→ http://localhost:8003/module1/upload` |
| 服务端点 | `/detect` | `/module1/upload` |

### 新的端点结构

**视频分析服务 (Port 8003):**
```
/module1/upload          # 视频谣言检测-单文件
/module1/uploads         # 视频谣言检测-批量
/module1/history         # 历史记录
/module1/history/{id}    # 单个记录详情

/module2/upload          # 视频语义理解-单文件
/module2/uploads         # 视频语义理解-批量  
/module2/history         # 历史记录
/module2/history/{id}    # 单个记录详情

/static/videos/{file}    # 示例视频
/health                  # 健康检查
```

**Gateway代理 (Port 8000):**
```
/api/v1/video-analysis/module1/upload
/api/v1/video-analysis/module1/uploads
/api/v1/video-analysis/module1/history
/api/v1/video-analysis/module1/history/{id}

/api/v1/video-analysis/module2/upload
/api/v1/video-analysis/module2/uploads
/api/v1/video-analysis/module2/history
/api/v1/video-analysis/module2/history/{id}

/api/v1/video-analysis/static/videos/{file}
```

## 🧪 测试步骤

### 1. 启动服务
```bash
# 启动视频分析服务
cd services/video_analysis
python app.py

# 启动Gateway
cd gateway
python app.py

# 启动前端
cd frontend
npm run dev
```

### 2. 测试直接服务调用
```bash
# 健康检查
curl http://localhost:8003/health

# 获取历史记录
curl http://localhost:8003/module1/history
curl http://localhost:8003/module2/history
```

### 3. 测试Gateway转发
```bash
# 通过Gateway获取历史记录
curl http://localhost:8000/api/v1/video-analysis/module1/history
curl http://localhost:8000/api/v1/video-analysis/module2/history
```

### 4. 测试前端集成
- 访问 http://localhost:5173
- 进入视频分析模块
- 测试文件上传功能
- 测试历史记录功能

## 🔧 重构要点

### ✅ 已完成修改

1. **移除前端直接代理**
   - 删除 `vite.config.ts` 中的 `/video_analysis` 代理配置
   - 统一通过Gateway访问

2. **简化服务端点**
   - 从 `/video_analysis/module1/xxx` 简化为 `/module1/xxx`
   - 更新 `app.py` 中的Blueprint注册

3. **更新Gateway路由**
   - 修改所有 `video_analysis/moduleX/xxx` 为 `moduleX/xxx`

4. **保持前端API不变**
   - `module1API` 和 `module2API` 仍然可用
   - 调用路径保持 `/api/v1/video-analysis/...`

### 🎯 架构优势

1. **一致性**: 与AI图像检测完全一致的架构模式
2. **简洁性**: 端点路径更简洁清晰
3. **统一性**: 所有请求都通过Gateway，便于管理
4. **可维护性**: 遵循相同的设计模式，易于维护

## 🐛 可能的问题与解决

1. **CORS问题**: 已在视频分析服务中配置Flask-CORS
2. **端点不匹配**: 确保Gateway和服务端点路径一致  
3. **文件上传**: 参数名统一使用 `file`（而非AI检测的 `image`）

---

**状态**: ✅ 重构完成，等待测试验证 