"""
API网关配置
"""
import os

# 服务端口配置
GATEWAY_PORT = int(os.getenv('GATEWAY_PORT', 8000))

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
    'video_analysis_module1': {
        'url': f"http://localhost:{os.getenv('VIDEO_MODULE1_PORT', 8003)}",
        'name': '视频分析模块1'
    },
    'video_analysis_module2': {
        'url': f"http://localhost:{os.getenv('VIDEO_MODULE2_PORT', 8004)}",
        'name': '视频分析模块2'
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