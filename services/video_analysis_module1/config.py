"""
视频分析模块1服务配置
"""
import os

# 服务端口
SERVICE_PORT = int(os.getenv('VIDEO_MODULE1_PORT', 8003))

# 服务信息
SERVICE_NAME = "视频分析模块1"
SERVICE_VERSION = "0.9.0"

# 数据库配置 (SQLite)
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///video_analysis_module1.db')

# 文件上传配置
MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv'}

# 模块配置
MODULE_CONFIG = {
    'name': 'video_analysis_module1',
    'version': '0.9.0',
    'description': '视频内容质量分析模块',
    'supported_formats': list(ALLOWED_EXTENSIONS),
    'max_duration': 600,  # 最大视频时长(秒)
    'features': [
        '视频质量评估',
        '内容分类',
        '场景识别',
        '对象检测'
    ]
} 