"""
目标检测模型预留接口
用于检测图像中的目标对象，为谣言检测提供额外的视觉信息
"""
import torch
import torch.nn as nn
from typing import List, Dict, Any, Optional
from PIL import Image
import numpy as np


class ObjectDetectionModel:
    """目标检测模型基类"""
    
    def __init__(self, model_path: str = None, device: str = 'cuda'):
        self.model_path = model_path
        self.device = device
        self.model = None
        self.is_loaded = False
        
    def load_model(self):
        """加载目标检测模型"""
        raise NotImplementedError("子类必须实现load_model方法")
    
    def detect_objects(self, image: Image.Image) -> List[Dict[str, Any]]:
        """
        检测图像中的目标对象
        
        Args:
            image: PIL图像对象
            
        Returns:
            List[Dict]: 检测结果列表，每个字典包含:
                - bbox: 边界框 [x1, y1, x2, y2]
                - confidence: 置信度
                - class_id: 类别ID
                - class_name: 类别名称
        """
        raise NotImplementedError("子类必须实现detect_objects方法")
    
    def extract_patches(self, image: Image.Image, detections: List[Dict[str, Any]]) -> List[Image.Image]:
        """
        根据检测结果提取图像块
        
        Args:
            image: 原始图像
            detections: 检测结果列表
            
        Returns:
            List[Image.Image]: 提取的图像块列表
        """
        patches = []
        img_width, img_height = image.size
        
        for detection in detections:
            bbox = detection['bbox']
            x1, y1, x2, y2 = bbox
            
            # 确保坐标在图像范围内
            x1 = max(0, min(x1, img_width))
            y1 = max(0, min(y1, img_height))
            x2 = max(x1, min(x2, img_width))
            y2 = max(y1, min(y2, img_height))
            
            # 确保有有效的区域
            if x2 > x1 and y2 > y1:
                try:
                    patch = image.crop((x1, y1, x2, y2))
                    # 如果patch太小，调整到最小尺寸
                    if patch.size[0] < 32 or patch.size[1] < 32:
                        patch = patch.resize((64, 64), Image.Resampling.LANCZOS)
                    patches.append(patch)
                except Exception as e:
                    print(f"[ObjectDetection] 提取图像块失败: {e}")
                    continue
        
        return patches


class YOLODetectionModel(ObjectDetectionModel):
    """YOLO目标检测模型实现 - 使用ultralytics"""
    
    def __init__(self, model_path: str = None, device: str = 'cuda'):
        super().__init__(model_path, device)
        self.confidence_threshold = 0.25  # 降低置信度阈值
        self.nms_threshold = 0.4
        self.model = None
        
    def load_model(self):
        """加载YOLO模型"""
        try:
            from ultralytics import YOLO
            
            # 如果没有指定模型路径，使用预训练的YOLOv8n
            if self.model_path is None:
                self.model_path = 'yolov8n.pt'
                print(f"[ObjectDetection] 使用默认预训练模型: {self.model_path}")
            
            print(f"[ObjectDetection] 加载YOLO模型: {self.model_path}")
            self.model = YOLO(self.model_path)
            
            # 设置设备
            if self.device == 'cuda' and torch.cuda.is_available():
                self.model.to('cuda')
                print(f"[ObjectDetection] 模型已移至GPU")
            else:
                self.model.to('cpu')
                print(f"[ObjectDetection] 模型运行在CPU")
            
            self.is_loaded = True
            print("[ObjectDetection] YOLO模型加载成功")
            
        except Exception as e:
            print(f"[ObjectDetection] YOLO模型加载失败: {e}")
            self.is_loaded = False
    
    def detect_objects(self, image: Image.Image) -> List[Dict[str, Any]]:
        """使用YOLO检测目标对象"""
        if not self.is_loaded or self.model is None:
            print("[ObjectDetection] 模型未加载，返回空结果")
            return []
        
        try:
            print(f"[ObjectDetection] 开始检测，置信度阈值: {self.confidence_threshold}, NMS阈值: {self.nms_threshold}")
            print(f"[ObjectDetection] 输入图像尺寸: {image.size}")
            
            # 运行YOLO检测
            results = self.model(image, conf=self.confidence_threshold, iou=self.nms_threshold, verbose=False)
            
            detections = []
            print(f"[ObjectDetection] YOLO返回 {len(results)} 个结果")
            
            for result in results:
                boxes = result.boxes
                print(f"[ObjectDetection] 当前结果的boxes: {boxes}")
                if boxes is not None:
                    print(f"[ObjectDetection] 检测到 {len(boxes)} 个边界框")
                    for i in range(len(boxes)):
                        # 获取边界框坐标
                        x1, y1, x2, y2 = boxes.xyxy[i].cpu().numpy()
                        
                        # 获取置信度
                        confidence = float(boxes.conf[i].cpu().numpy())
                        
                        # 获取类别ID和名称
                        class_id = int(boxes.cls[i].cpu().numpy())
                        class_name = self.model.names[class_id] if hasattr(self.model, 'names') else f'class_{class_id}'
                        
                        detection = {
                            'bbox': [float(x1), float(y1), float(x2), float(y2)],
                            'confidence': confidence,
                            'class_id': class_id,
                            'class_name': class_name
                        }
                        detections.append(detection)
            
            print(f"[ObjectDetection] 检测到 {len(detections)} 个目标")
            
            # 如果没有检测到任何目标，尝试更低的置信度
            if len(detections) == 0 and self.confidence_threshold > 0.1:
                print(f"[ObjectDetection] 未检测到目标，尝试更低置信度 0.1")
                backup_results = self.model(image, conf=0.1, iou=self.nms_threshold, verbose=False)
                backup_detections = []
                for result in backup_results:
                    boxes = result.boxes
                    if boxes is not None:
                        for i in range(len(boxes)):
                            x1, y1, x2, y2 = boxes.xyxy[i].cpu().numpy()
                            confidence = float(boxes.conf[i].cpu().numpy())
                            class_id = int(boxes.cls[i].cpu().numpy())
                            class_name = self.model.names[class_id] if hasattr(self.model, 'names') else f'class_{class_id}'
                            
                            backup_detection = {
                                'bbox': [float(x1), float(y1), float(x2), float(y2)],
                                'confidence': confidence,
                                'class_id': class_id,
                                'class_name': class_name
                            }
                            backup_detections.append(backup_detection)
                print(f"[ObjectDetection] 备用检测结果: {len(backup_detections)} 个目标")
                return backup_detections
            
            return detections
            
        except Exception as e:
            print(f"[ObjectDetection] YOLO检测失败: {e}")
            return []


class DETRDetectionModel(ObjectDetectionModel):
    """DETR目标检测模型实现"""
    
    def __init__(self, model_path: str = None, device: str = 'cuda'):
        super().__init__(model_path, device)
        
    def load_model(self):
        """加载DETR模型"""
        try:
            # 预留DETR模型加载代码
            print("[ObjectDetection] 预留DETR模型加载接口")
            self.is_loaded = True
        except Exception as e:
            print(f"[ObjectDetection] DETR模型加载失败: {e}")
            self.is_loaded = False
    
    def detect_objects(self, image: Image.Image) -> List[Dict[str, Any]]:
        """使用DETR检测目标对象"""
        if not self.is_loaded:
            print("[ObjectDetection] 模型未加载，返回空结果")
            return []
        
        # 预留DETR检测代码
        print("[ObjectDetection] 预留DETR检测接口")
        
        # 返回示例结果
        return [
            {
                'bbox': [150, 150, 250, 250],
                'confidence': 0.92,
                'class_id': 1,
                'class_name': 'car'
            }
        ]


class ObjectDetectionService:
    """目标检测服务"""
    
    def __init__(self, model_type: str = 'yolo', model_path: str = None, confidence_threshold: float = None, nms_threshold: float = None):
        self.model_type = model_type
        self.model_path = model_path
        self.confidence_threshold = confidence_threshold
        self.nms_threshold = nms_threshold
        self.detection_model = None
        self._initialize_model()
    
    def _initialize_model(self):
        """初始化目标检测模型"""
        if self.model_type.lower() == 'yolo':
            self.detection_model = YOLODetectionModel(self.model_path)
        elif self.model_type.lower() == 'detr':
            self.detection_model = DETRDetectionModel(self.model_path)
        else:
            raise ValueError(f"不支持的目标检测模型类型: {self.model_type}")
        
        # 设置阈值（如果提供）
        if self.confidence_threshold is not None:
            self.detection_model.confidence_threshold = self.confidence_threshold
            print(f"[ObjectDetection] 设置置信度阈值: {self.confidence_threshold}")
        
        if self.nms_threshold is not None:
            self.detection_model.nms_threshold = self.nms_threshold
            print(f"[ObjectDetection] 设置NMS阈值: {self.nms_threshold}")
        
        # 加载模型
        self.detection_model.load_model()
    
    def detect_and_extract_patches(self, image: Image.Image, max_patches: int = 5) -> List[Image.Image]:
        """
        检测目标并提取图像块
        
        Args:
            image: 输入图像
            max_patches: 最大提取的块数量
            
        Returns:
            List[Image.Image]: 提取的图像块列表
        """
        if self.detection_model is None:
            print("[ObjectDetection] 检测模型未初始化")
            return []
        
        # 检测目标
        detections = self.detection_model.detect_objects(image)
        
        # 按置信度排序
        detections.sort(key=lambda x: x['confidence'], reverse=True)
        
        # 提取图像块
        patches = self.detection_model.extract_patches(image, detections[:max_patches])
        
        print(f"[ObjectDetection] 检测到 {len(detections)} 个目标，提取 {len(patches)} 个图像块")
        
        return patches
    
    def get_detection_info(self, image: Image.Image) -> Dict[str, Any]:
        """
        获取检测信息
        
        Args:
            image: 输入图像
            
        Returns:
            Dict: 检测信息
        """
        if self.detection_model is None:
            return {"objects": [], "patch_count": 0}
        
        detections = self.detection_model.detect_objects(image)
        
        return {
            "objects": detections,
            "patch_count": len(detections),
            "model_type": self.model_type
        }


# 全局目标检测服务实例
_object_detection_service = None


def get_object_detection_service(model_type: str = 'yolo', model_path: str = None, confidence_threshold: float = None, nms_threshold: float = None) -> ObjectDetectionService:
    """获取目标检测服务实例（单例模式）"""
    global _object_detection_service
    if _object_detection_service is None:
        _object_detection_service = ObjectDetectionService(model_type, model_path, confidence_threshold, nms_threshold)
    return _object_detection_service


def initialize_object_detection(model_type: str = 'yolo', model_path: str = None):
    """初始化目标检测服务"""
    global _object_detection_service
    _object_detection_service = ObjectDetectionService(model_type, model_path)
    return _object_detection_service
