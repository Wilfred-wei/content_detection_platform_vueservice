"""
图文谣言检测服务配置
"""
import os

# 服务端口
SERVICE_PORT = int(os.getenv('RUMOR_SERVICE_PORT', 8010))

# 服务信息
SERVICE_NAME = "图文谣言检测服务"
SERVICE_VERSION = "1.0.0"

# 数据库配置 (SQLite)
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///rumor_detection.db')

# 文件上传配置
MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB
UPLOAD_FOLDER = 'uploads'

# 模型配置
MODEL_CONFIG = {
    'name': 'rumor_detection_v1',
    'version': '1.0.0',
    'confidence_threshold': 0.7
} 