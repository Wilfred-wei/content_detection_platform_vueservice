"""
视频分析模块2配置 - 占位符实现，用于后续开发
"""
import os

# 服务基础配置
SERVICE_NAME = "视频分析模块2"
SERVICE_VERSION = "0.1.0-placeholder"
SERVICE_PORT = int(os.getenv('VIDEO_MODULE2_PORT', 8004))

# 文件上传配置
MAX_CONTENT_LENGTH = 500 * 1024 * 1024  # 500MB
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv'}

# 模块配置
MODULE_CONFIG = {
    'name': 'Video Content Safety Analysis',
    'description': '视频内容安全检测模块',
    'version': SERVICE_VERSION,
    'status': 'development',  # 开发中
    'features': [
        '视频内容安全检测 (规划中)',
        '违规内容识别 (规划中)', 
        '智能审核建议 (规划中)',
        '批量处理支持 (规划中)'
    ],
    'supported_formats': list(ALLOWED_EXTENSIONS),
    'max_file_size': f"{MAX_CONTENT_LENGTH // (1024*1024)}MB"
} 