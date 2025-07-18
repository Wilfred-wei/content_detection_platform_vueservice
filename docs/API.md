# 内容检测平台 API 文档

## 📋 概述

本文档描述了内容检测平台的微服务API接口。所有API请求都通过API网关进行统一路由。

## 🔗 基础信息

- **API网关地址**: `http://localhost:8000`
- **API版本**: `v1`
- **响应格式**: JSON
- **字符编码**: UTF-8

## 📦 统一响应格式

所有API响应都遵循以下统一格式：

### 成功响应
```json
{
  "success": true,
  "data": {},
  "message": "操作成功",
  "code": 200,
  "timestamp": "2024-01-01T00:00:00"
}
```

### 错误响应
```json
{
  "success": false,
  "message": "错误描述",
  "code": 400,
  "errors": {},
  "timestamp": "2024-01-01T00:00:00"
}
```

## 🔍 系统管理 API

### 健康检查
检查API网关健康状态。

**请求**
```http
GET /health
```

**响应**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "service": "API Gateway"
  },
  "message": "操作成功",
  "code": 200,
  "timestamp": "2024-01-01T00:00:00"
}
```

### 服务状态查询
查询所有微服务的运行状态。

**请求**
```http
GET /services/status
```

**响应**
```json
{
  "success": true,
  "data": {
    "services": {
      "rumor_detection": {
        "name": "图文谣言检测服务",
        "url": "http://localhost:8001",
        "status": "healthy"
      },
      "ai_image_detection": {
        "name": "AI图像检测服务", 
        "url": "http://localhost:8002",
        "status": "healthy"
      }
    }
  }
}
```

## 📝 图文谣言检测 API

### 检测谣言
分析文本内容是否为谣言。

**请求**
```http
POST /api/v1/rumor/detect
Content-Type: application/json

{
  "content": "要检测的文本内容"
}
```

**参数说明**
- `content` (string, 必填): 要检测的文本内容，5-10000字符

**响应**
```json
{
  "success": true,
  "data": {
    "task_id": "uuid-string",
    "status": "completed",
    "result": {
      "is_rumor": false,
      "confidence": 0.85,
      "probability": 0.25,
      "reasoning": ["内容来源可靠", "事实核查通过"],
      "keywords": [],
      "sources_checked": ["权威新闻网站", "官方发布平台"],
      "risk_level": "low"
    },
    "confidence": 0.85
  }
}
```

## 🖼️ AI图像检测 API

### 检测AI生成图像
检测上传的图像是否为AI生成。

**请求**
```http
POST /api/v1/ai-image/detect
Content-Type: multipart/form-data

image: [图像文件]
```

**参数说明**
- `image` (file, 必填): 图像文件，支持 JPG, PNG, BMP, TIFF, WEBP，最大10MB

**响应**
```json
{
  "success": true,
  "data": {
    "task_id": "uuid-string",
    "status": "completed",
    "result": {
      "task_id": "uuid-string",
      "prediction": "real",
      "prediction_text": "真实图像",
      "confidence": 0.92,
      "confidence_percentage": 92.0,
      "ai_probability": 0.08,
      "processing_time": 1.5,
      "file_size": 2048576,
      "image_width": 1920,
      "image_height": 1080,
      "image_format": "JPEG"
    }
  }
}
```

### 获取检测结果
根据任务ID获取AI图像检测结果。

**请求**
```http
GET /api/v1/ai-image/result/{task_id}
```

**响应**
与检测接口相同的响应格式。

## 🎬 视频分析 API

### 视频分析模块1
视频内容质量分析（框架实现）。

**请求**
```http
POST /api/v1/video-analysis/module1/detect
Content-Type: multipart/form-data

video: [视频文件]
```

**参数说明**
- `video` (file, 必填): 视频文件，支持 MP4, AVI, MOV, WMV, FLV, MKV，最大100MB

**响应**
```json
{
  "success": true,
  "data": {
    "task_id": "uuid-string",
    "status": "completed",
    "result": {
      "analysis_result": {
        "quality_score": 0.85,
        "content_tags": ["教育", "科技"],
        "scene_analysis": {
          "indoor_probability": 0.8,
          "outdoor_probability": 0.2,
          "human_presence": true,
          "lighting_quality": "good",
          "camera_stability": 0.9
        },
        "objects_detected": [
          {
            "object": "person",
            "confidence": 0.95,
            "count": 2
          }
        ],
        "summary": "视频质量良好，检测到2个内容标签，1类对象"
      }
    }
  }
}
```

### 视频分析模块2
视频内容安全检测（维护中）。

**请求**
```http
POST /api/v1/video-analysis/module2/detect
Content-Type: multipart/form-data

video: [视频文件]
```

**响应**
```json
{
  "success": true,
  "data": {
    "task_id": "module2_maintenance",
    "status": "maintenance",
    "message": "视频内容安全检测模块暂时维护中，预计下个版本开放"
  }
}
```

## 📊 错误码说明

| 错误码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 413 | 上传文件过大 |
| 500 | 服务器内部错误 |
| 503 | 服务不可用 |

## 🔧 使用示例

### cURL 示例

```bash
# 谣言检测
curl -X POST http://localhost:8000/api/v1/rumor/detect \
  -H "Content-Type: application/json" \
  -d '{"content": "这是一条测试内容"}'

# AI图像检测
curl -X POST http://localhost:8000/api/v1/ai-image/detect \
  -F "image=@test.jpg"

# 视频分析
curl -X POST http://localhost:8000/api/v1/video-analysis/module1/detect \
  -F "video=@test.mp4"
```

### JavaScript 示例

```javascript
// 谣言检测
const rumorResponse = await fetch('/api/v1/rumor/detect', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    content: '要检测的文本内容'
  })
});

// AI图像检测
const formData = new FormData();
formData.append('image', imageFile);

const aiImageResponse = await fetch('/api/v1/ai-image/detect', {
  method: 'POST',
  body: formData
});
```

## 📝 注意事项

1. **文件大小限制**: 图像文件最大10MB，视频文件最大100MB
2. **文件格式**: 请使用支持的文件格式
3. **请求频率**: 建议每秒不超过10次请求
4. **异步处理**: 复杂的检测任务可能需要轮询结果接口
5. **错误处理**: 请根据响应中的错误信息进行相应处理 