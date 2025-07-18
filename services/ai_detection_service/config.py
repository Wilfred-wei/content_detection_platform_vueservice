import os

class Config:
    # 模型配置
    MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'AIDE_Django', 'detection_Model')
    DEVICE = 'cuda' if os.environ.get('USE_CUDA') == 'true' else 'cpu'
    
    # 文件配置
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    MAX_IMAGE_SIZE = (4096, 4096)  # 最大图像尺寸
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}
    
    # 批量处理配置
    MAX_BATCH_SIZE = 50  # 最大批量处理数量
    
    # 服务配置
    HOST = '0.0.0.0'
    PORT = 8002
    DEBUG = True
    
    # 上传目录
    UPLOAD_FOLDER = 'uploads'
    HEATMAP_FOLDER = 'heatmaps'
    
    # 确保上传目录存在
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    os.makedirs(HEATMAP_FOLDER, exist_ok=True) 