"""
API网关配置
"""
import os

# 服务端口配置
GATEWAY_PORT = int(os.getenv('GATEWAY_PORT', 28000))

# 微服务地址配置
SERVICES = {
    'rumor_detection': {
        'url': f"http://localhost:{os.getenv('RUMOR_SERVICE_PORT', 8010)}",
        'name': '图文谣言检测服务'
    },
    'ai_image_detection': {
        'url': f"http://localhost:{os.getenv('AI_IMAGE_SERVICE_PORT', 8002)}",
        'name': 'AI图像检测服务'
    },
    'detection_agent': {
        'url': f"http://localhost:{os.getenv('DETECTION_AGENT_PORT', 8020)}",
        'name': '智能检测Agent服务'
    },
    'video_analysis': {
        'url': f"http://localhost:{os.getenv('VIDEO_ANALYSIS_PORT', 8003)}",
        'name': '视频分析服务'
    }
}

# CORS配置
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:8080",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8080"
]

# 文件上传配置
MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB
UPLOAD_FOLDER = 'uploads'

# 健康检查配置
HEALTH_CHECK_TIMEOUT = 5
