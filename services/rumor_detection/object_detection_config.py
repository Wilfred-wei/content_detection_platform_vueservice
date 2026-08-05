"""
目标检测模型配置文件
"""
import os
from typing import Dict, Any


class ObjectDetectionConfig:
    """目标检测配置类"""
    
    def __init__(self):
        # 默认配置
        self.default_config = {
            'enabled': True,  # 是否启用目标检测（默认启用）
            'model_type': 'yolo',  # 模型类型: 'yolo', 'detr'
            'model_path': 'yolov8n.pt',  # 模型文件路径（使用YOLOv8n预训练模型）
            'confidence_threshold': 0.1,  # 置信度阈值 (降低以检测更多目标)
            'nms_threshold': 0.2,  # NMS阈值
            'max_patches': 5,  # 最大提取的图像块数量
            'device': 'cuda',  # 设备类型
            'class_names': [],  # 类别名称列表
        }
        
        # 加载配置
        self.config = self._load_config()
    
    def _load_config(self) -> Dict[str, Any]:
        """加载配置文件"""
        config = self.default_config.copy()
        
        # 从环境变量加载配置
        if os.getenv('OBJECT_DETECTION_ENABLED'):
            config['enabled'] = os.getenv('OBJECT_DETECTION_ENABLED').lower() == 'true'
        
        if os.getenv('OBJECT_DETECTION_MODEL_TYPE'):
            config['model_type'] = os.getenv('OBJECT_DETECTION_MODEL_TYPE')
        
        if os.getenv('OBJECT_DETECTION_MODEL_PATH'):
            config['model_path'] = os.getenv('OBJECT_DETECTION_MODEL_PATH')
        
        if os.getenv('OBJECT_DETECTION_CONFIDENCE_THRESHOLD'):
            config['confidence_threshold'] = float(os.getenv('OBJECT_DETECTION_CONFIDENCE_THRESHOLD'))
        
        if os.getenv('OBJECT_DETECTION_NMS_THRESHOLD'):
            config['nms_threshold'] = float(os.getenv('OBJECT_DETECTION_NMS_THRESHOLD'))
        
        if os.getenv('OBJECT_DETECTION_MAX_PATCHES'):
            config['max_patches'] = int(os.getenv('OBJECT_DETECTION_MAX_PATCHES'))
        
        if os.getenv('OBJECT_DETECTION_DEVICE'):
            config['device'] = os.getenv('OBJECT_DETECTION_DEVICE')
        
        return config
    
    def get(self, key: str, default=None):
        """获取配置值"""
        return self.config.get(key, default)
    
    def set(self, key: str, value: Any):
        """设置配置值"""
        self.config[key] = value
    
    def is_enabled(self) -> bool:
        """检查目标检测是否启用"""
        return self.config['enabled']
    
    def get_model_config(self) -> Dict[str, Any]:
        """获取模型配置"""
        return {
            'model_type': self.config['model_type'],
            'model_path': self.config['model_path'],
            'confidence_threshold': self.config['confidence_threshold'],
            'nms_threshold': self.config['nms_threshold'],
            'device': self.config['device'],
        }
    
    def get_patch_config(self) -> Dict[str, Any]:
        """获取图像块配置"""
        return {
            'max_patches': self.config['max_patches'],
        }
    
    def print_config(self):
        """打印当前配置"""
        print("目标检测配置:")
        print("-" * 30)
        for key, value in self.config.items():
            print(f"  {key}: {value}")
        print("-" * 30)


# 全局配置实例
_object_detection_config = None


def get_object_detection_config() -> ObjectDetectionConfig:
    """获取目标检测配置实例（单例模式）"""
    global _object_detection_config
    if _object_detection_config is None:
        _object_detection_config = ObjectDetectionConfig()
    return _object_detection_config


def initialize_object_detection_config():
    """初始化目标检测配置"""
    global _object_detection_config
    _object_detection_config = ObjectDetectionConfig()
    return _object_detection_config


# 预定义的模型配置
YOLO_CONFIGS = {
    'yolov5': {
        'model_type': 'yolo',
        'model_path': 'pretrained_models/yolo/yolov5s.pt',
        'confidence_threshold': 0.5,
        'nms_threshold': 0.4,
    },
    'yolov8': {
        'model_type': 'yolo',
        'model_path': 'pretrained_models/yolo/yolov8n.pt',
        'confidence_threshold': 0.1,
        'nms_threshold': 0.2,
    }
}

DETR_CONFIGS = {
    'detr': {
        'model_type': 'detr',
        'model_path': 'pretrained_models/detr/detr_resnet50.pth',
        'confidence_threshold': 0.7,
        'nms_threshold': 0.5,
    }
}


def get_preset_config(model_name: str) -> Dict[str, Any]:
    """获取预定义配置"""
    if model_name in YOLO_CONFIGS:
        return YOLO_CONFIGS[model_name]
    elif model_name in DETR_CONFIGS:
        return DETR_CONFIGS[model_name]
    else:
        raise ValueError(f"未知的模型配置: {model_name}")


def setup_object_detection(model_name: str = None, custom_config: Dict[str, Any] = None):
    """设置目标检测配置"""
    config = get_object_detection_config()
    
    if custom_config:
        # 使用自定义配置
        for key, value in custom_config.items():
            config.set(key, value)
    elif model_name:
        # 使用预定义配置
        preset_config = get_preset_config(model_name)
        for key, value in preset_config.items():
            config.set(key, value)
    
    # 启用目标检测
    config.set('enabled', True)
    
    print(f"目标检测配置已设置:")
    config.print_config()
    
    return config
