"""
图文谣言检测服务业务逻辑
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) )

import time
import random
from typing import Dict, Any, List
from datetime import datetime
from shared.utils import generate_task_id
from shared.response_models import DetectionStatus
from models import RumorDetectionTask, RumorDetectionResult

# === 导入C3N模型相关 ===
import torch
import torch.nn.functional as F
from PIL import Image
from torchvision.transforms import Compose, Resize, CenterCrop, ToTensor, Normalize
from C3N_models import C3N
import cn_clip.clip as clip

# === 预处理函数定义 ===
def clip_preprocess():
    """CLIP图像预处理函数"""
    return Compose([
        Resize(224, interpolation=3),
        CenterCrop(224),
        ToTensor(),
        Normalize((0.48145466, 0.4578275, 0.40821073), (0.26862954, 0.26130258, 0.27577711))
    ])

PREPROCESS = clip_preprocess()

def chinese_tokenize(text, context_length=30):
    """中文文本tokenize函数 - 适配C3N模型"""
    # 简单的文本预处理
    text = text.strip()
    if len(text) == 0:
        text = "空文本"
    
    # 使用CLIP的tokenizer
    tokens = clip.tokenize(text, context_length=context_length)
    
    # 确保返回2维张量 [1, context_length]
    if len(tokens.shape) == 1:
        tokens = tokens.unsqueeze(0)
    elif len(tokens.shape) > 2:
        tokens = tokens.squeeze(0)
    
    return tokens  # 确保返回 [1, context_length] 的形状

class RumorDetectionService:
    """图文谣言检测服务"""
    def __init__(self):
        self.tasks = {}
        self.model_version = "C3N-v1.0"
        
        # 设置设备
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        print(f"[C3N] 使用设备: {self.device}")
        
        # 创建模型参数
        class Args:
            def __init__(self, device):
                self.device = device
        
        args = Args(self.device)
        
        # 初始化C3N模型
        try:
            print("[C3N] 初始化C3N模型...")
            self.model = C3N(args)
            
            # 加载预训练权重
            model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), './C3N_models.pt')
            if os.path.exists(model_path):
                print(f"[C3N] 加载预训练权重: {model_path}")
                checkpoint = torch.load(model_path, map_location=self.device)
                
                # 加载模型权重
                if 'model_state_dict' in checkpoint:
                    self.model.load_state_dict(checkpoint['model_state_dict'])
                else:
                    # 如果直接是模型状态字典
                    self.model.load_state_dict(checkpoint)
                
                print("[C3N] 预训练权重加载成功")
            else:
                print(f"[C3N] 未找到预训练权重文件: {model_path}")
            
            self.model.eval()
            print("[C3N] 模型初始化完成")
            
        except Exception as e:
            print(f"[C3N] 模型初始化失败: {e}")
            import traceback
            traceback.print_exc()
            self.model = None

    def detect_rumor(self, content: str, image_path: str = None) -> RumorDetectionTask:
        task_id = generate_task_id()
        task = RumorDetectionTask(
            task_id=task_id,
            content=content,
            image_path=image_path,
            status=DetectionStatus.PENDING
        )
        self.tasks[task_id] = task
        self._process_detection(task)
        return task

    def detect_rumor_sync(self, content: str, image_path: str = None) -> Dict[str, Any]:
        """同步检测谣言，直接返回结果 - 参考main.py的推理方法"""
        try:
            print(f"开始同步处理谣言检测: {content[:50]}...")
            if self.model is None:
                raise RuntimeError("C3N模型未初始化")
            
            # 准备输入数据
            data = self._prepare_input_data(content, image_path)
            
            # 模型推理 - 参考main.py的compute_test方法
            with torch.no_grad():
                logits = self.model(data)
                probs = F.softmax(logits, dim=1)
            
            # 解析结果
            is_rumor = bool(torch.argmax(probs, dim=1).item())
            confidence = probs[0, int(is_rumor)].item()
            
            print(f"[DEBUG] 推理结果 - is_rumor: {is_rumor}, confidence: {confidence:.3f}")
            
            # 生成推理结果
            reasoning = []
            if is_rumor:
                reasoning.append("C3N模型判定为谣言，建议核查信息来源")
                if confidence > 0.8:
                    reasoning.append("置信度较高，请谨慎对待")
                else:
                    reasoning.append("置信度中等，建议进一步核实")
            else:
                reasoning.append("C3N模型判定为非谣言")
                if confidence > 0.8:
                    reasoning.append("置信度较高，信息相对可靠")
                else:
                    reasoning.append("置信度中等，仍需注意信息来源")
            
            sources_checked = ["C3N模型数据库", "中文CLIP图文融合分析"]
            result = RumorDetectionResult(
                is_rumor=is_rumor,
                confidence=confidence,
                probability=confidence,
                reasoning=reasoning,
                keywords=[],
                sources_checked=sources_checked,
                risk_level="high" if confidence > 0.7 and is_rumor else "medium" if confidence > 0.5 else "low"
            )
            
            print(f"同步检测完成，结果: {'谣言' if is_rumor else '非谣言'}, 置信度: {confidence:.3f}")
            
            return {
                "success": True,
                "is_rumor": is_rumor,
                "confidence": confidence,
                "result": result.to_dict(),
                "message": "检测完成"
            }
            
        except Exception as e:
            print(f"同步检测失败: {str(e)}")
            import traceback
            traceback.print_exc()
            
            return {
                "success": False,
                "is_rumor": False,
                "confidence": 0.0,
                "result": None,
                "message": f"检测失败: {str(e)}"
            }

    def _prepare_input_data(self, content: str, image_path: str = None) -> Dict[str, torch.Tensor]:
        """准备模型输入数据 - 适配C3N模型"""
        # 文本预处理 - 返回 [1, context_length]
        text_tensor = chinese_tokenize(content)
        text_input = text_tensor
        
        # 图像预处理
        if image_path and os.path.exists(image_path):
            img = Image.open(image_path).convert("RGB")
            image_tensor = PREPROCESS(img)
        else:
            image_tensor = torch.zeros(3, 224, 224)
        
        # 准备图像输入 - 使用多个crop模拟多视角
        # 需要 [batch_size, num_crops, 3, 224, 224]
        crop_images = torch.stack([image_tensor] * 5)  # [5, 3, 224, 224]
        crop_input = crop_images.unsqueeze(0)  # [1, 5, 3, 224, 224]
        
        # 移动到设备
        data = {
            'text_input': text_input.to(self.device),  # [1, context_length]
            'crop_input': crop_input.to(self.device)   # [1, 5, 3, 224, 224]
        }
        
        return data

    def get_task_result(self, task_id: str) -> RumorDetectionTask:
        if task_id not in self.tasks:
            raise ValueError(f"任务不存在: {task_id}")
        return self.tasks[task_id]

    def _process_detection(self, task: RumorDetectionTask):
        """异步处理检测任务 - 简化版本"""
        try:
            task.status = DetectionStatus.PROCESSING
            print(f"开始处理谣言检测任务: {task.task_id}")
            
            # 准备输入数据
            data = self._prepare_input_data(task.content, task.image_path)
            
            # 模型推理
            with torch.no_grad():
                logits = self.model(data)
                probs = F.softmax(logits, dim=1)
            
            # 解析结果
            is_rumor = bool(torch.argmax(probs, dim=1).item())
            confidence = probs[0, int(is_rumor)].item()
            
            # 生成推理结果
            reasoning = []
            if is_rumor:
                reasoning.append("C3N模型判定为谣言，建议核查信息来源")
            else:
                reasoning.append("C3N模型判定为非谣言")
            
            sources_checked = ["C3N模型数据库"]
            result = RumorDetectionResult(
                is_rumor=is_rumor,
                confidence=confidence,
                probability=confidence,
                reasoning=reasoning,
                keywords=[],
                sources_checked=sources_checked,
                risk_level="high" if is_rumor else "low"
            )
            task.result = result.to_dict()
            task.confidence = confidence
            task.status = DetectionStatus.COMPLETED
            task.completed_at = datetime.now()
            print(f"谣言检测完成: {task.task_id}, 结果: {'谣言' if is_rumor else '非谣言'}")
    
        except Exception as e:
            task.status = DetectionStatus.FAILED
            task.error_message = str(e)
            task.completed_at = datetime.now()
            print(f"谣言检测失败: {task.task_id}, 错误: {str(e)}")
            import traceback
            traceback.print_exc()
    
    def get_service_stats(self) -> Dict[str, Any]:
        """获取服务统计信息"""
        total_tasks = len(self.tasks)
        completed_tasks = sum(1 for task in self.tasks.values() if task.status == DetectionStatus.COMPLETED)
        failed_tasks = sum(1 for task in self.tasks.values() if task.status == DetectionStatus.FAILED)
        
        return {
            'service_name': '图文谣言检测服务',
            'model_version': self.model_version,
            'total_tasks': total_tasks,
            'completed_tasks': completed_tasks,
            'failed_tasks': failed_tasks,
            'success_rate': (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
        }


# 全局服务实例
_rumor_service = None


def get_rumor_detection_service() -> RumorDetectionService:
    """获取图文谣言检测服务实例 (单例模式)"""
    global _rumor_service
    if _rumor_service is None:
        _rumor_service = RumorDetectionService()
    return _rumor_service 