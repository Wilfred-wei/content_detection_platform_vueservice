import os
from pathlib import Path

basedir = Path(__file__).parent

class Config:
    # 模块一配置
    MODULE1_UPLOAD_FOLDER = str(basedir / 'temp_uploads/module1')
    MODULE1_DATA_FOLDER = str(basedir / 'temp_data')
    MODULE1_ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov','mkv'}
    MODULE1_VIDEO_FOLDER=str(Path(__file__).parent / 'temp_uploads/module1')
    # 模块二配置
    MODULE2_UPLOAD_FOLDER = str(basedir / 'temp_uploads/module2')
    MODULE2_DATA_FOLDER = str(basedir / 'temp_data')
    MODULE2_ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv'} 
    MODULE3_VIDEO_FOLDER=str(Path(__file__).parent / 'temp_uploads/module2/videos')
    #模块三    
    MODULE3_DATA_FOLDER = str(basedir / 'temp_data')
    MODULE3_VIDEO_FOLDER=str(Path(__file__).parent / 'temp_uploads/module3')
    MODULE3_ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv'} 
    # 上传大小限制
    MAX_CONTENT_LENGTH = 500 * 1024 * 1024 # 500MB