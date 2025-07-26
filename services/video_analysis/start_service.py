#!/usr/bin/env python3
"""
视频分析服务启动脚本
确保所有必要的目录和配置都已正确设置
"""

import os
import sys
import logging
from pathlib import Path

# 添加当前目录到系统路径
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def check_dependencies():
    """检查必要的依赖是否已安装"""
    required_packages = ['flask', 'flask_cors', 'torch', 'PIL']
    missing_packages = []
    
    for package in required_packages:
        try:
            __import__(package)
        except ImportError:
            missing_packages.append(package)
    
    if missing_packages:
        logger.error(f"缺少以下依赖包: {', '.join(missing_packages)}")
        logger.error("请运行: pip install -r requirements.txt")
        return False
    
    return True

def setup_directories():
    """创建必要的目录结构"""
    from config import Config
    
    directories = [
        Config.MODULE1_UPLOAD_FOLDER,
        Config.MODULE2_UPLOAD_FOLDER,
        Config.MODULE1_DATA_FOLDER,
        Config.MODULE2_DATA_FOLDER
    ]
    
    for directory in directories:
        os.makedirs(directory, exist_ok=True)
        logger.info(f"确保目录存在: {directory}")

def check_example_videos():
    """检查示例视频文件是否存在"""
    video_dir = current_dir.parent.parent / 'frontend' / 'public' / 'static' / 'videos'
    
    required_videos = [
        'example3_2_1_T.mp4',
        'example3_2_1_U.mp4', 
        'example3_2_1_F.mp4',
        'example3_2_2_News.mp4',
        'example3_2_2_Life.mp4',
        'example3_2_2_Mil.mp4'
    ]
    
    missing_videos = []
    for video in required_videos:
        video_path = video_dir / video
        if not video_path.exists():
            missing_videos.append(video)
    
    if missing_videos:
        logger.warning(f"缺少以下示例视频文件: {', '.join(missing_videos)}")
        logger.warning(f"视频目录: {video_dir}")
    else:
        logger.info("所有示例视频文件都存在")

def start_service():
    """启动视频分析服务"""
    logger.info("正在启动视频分析服务...")
    
    # 检查依赖
    if not check_dependencies():
        sys.exit(1)
    
    # 设置目录
    setup_directories()
    
    # 检查示例视频
    check_example_videos()
    
    # 启动Flask应用
    try:
        from app import app
        logger.info("视频分析服务启动成功!")
        logger.info("服务地址: http://127.0.0.1:8003")
        logger.info("API端点:")
        logger.info("  - 视频谣言检测: /video_analysis/module1/")
        logger.info("  - 视频语义理解: /video_analysis/module2/")
        logger.info("  - 示例视频: /static/videos/<filename>")
        
        app.run(host='0.0.0.0', port=8003, debug=True)
        
    except Exception as e:
        logger.error(f"服务启动失败: {str(e)}")
        sys.exit(1)

if __name__ == '__main__':
    start_service() 