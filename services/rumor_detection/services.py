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
import re

# === 导入目标检测模型 ===
from object_detection_model import get_object_detection_service
from object_detection_config import get_object_detection_config

# === 导入增强检测器 ===
from enhanced_rumor_detector import get_enhanced_detector

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

def chinese_tokenize(text, context_length=200):
    """中文文本tokenize函数 - 适配C3N模型"""
    # 文本预处理
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

def split_text_to_sentences(text):
    """将文本分割为句子"""
    # 以中文句号、问号、感叹号、英文句号、问号、感叹号分割
    sentences = re.split(r'[。！？!?\.!?]', text)
    # 去除空白句子
    sentences = [s.strip() for s in sentences if s.strip()]
    return sentences

class RumorDetectionService:
    """图文谣言检测服务"""
    def __init__(self):
        self.tasks = {}
        self.model_version = "C3N-v2.0"
        
        # 设置设备
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        print(f"[C3N] 使用设备: {self.device}")
        
        # 创建模型参数 - 适配真实C3N模型
        class Args:
            def __init__(self, device):
                self.device = device
                self.dataset = 'weibo'  # 使用中文数据集
                self.conv_out = 64
                self.crop_num = 6  # 图像块数量
                self.st_num = 31   # 句子数量
                self.dropout_p = 0
                self.layer_num = 8  # transformer层数
                self.conv_kernel = [1, 2, 3]  # 卷积核大小
                self.finetune = False
        
        args = Args(self.device)
        
        # 初始化C3N模型
        try:
            print("[C3N] 初始化C3N模型...")
            self.model = C3N(args)
            
            # 加载预训练权重
            model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'C3N_models.pt')
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
                print("[C3N] 使用随机初始化的模型")
            
            self.model.to(self.device)
            self.model.eval()
            print("[C3N] 模型初始化完成")
            
        except Exception as e:
            print(f"[C3N] 模型初始化失败: {e}")
            import traceback
            traceback.print_exc()
            self.model = None

        # 初始化目标检测服务
        try:
            print("[ObjectDetection] 初始化目标检测服务...")
            od_config = get_object_detection_config()
            
            if od_config.is_enabled():
                model_config = od_config.get_model_config()
                self.object_detection_service = get_object_detection_service(
                    model_type=model_config['model_type'],
                    model_path=model_config['model_path'],
                    confidence_threshold=model_config['confidence_threshold'],
                    nms_threshold=model_config['nms_threshold']
                )
                print("[ObjectDetection] 目标检测服务初始化完成")
                od_config.print_config()
            else:
                print("[ObjectDetection] 目标检测未启用")
                self.object_detection_service = None
                
        except Exception as e:
            print(f"[ObjectDetection] 目标检测服务初始化失败: {e}")
            self.object_detection_service = None

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
        """同步检测谣言，直接返回结果 - 使用增强检测器"""
        try:
            print(f"开始同步处理谣言检测: {content[:50]}...")

            # 获取基础模型结果
            base_result = None
            if self.model is not None:
                try:
                    # 准备输入数据
                    data = self._prepare_input_data(content, image_path)

                    # 模型推理
                    with torch.no_grad():
                        logits = self.model(data)
                        probs = F.softmax(logits, dim=1)

                    # 解析结果
                    is_rumor = bool(torch.argmax(probs, dim=1).item())
                    confidence = probs[0, int(is_rumor)].item()

                    base_result = {
                        'is_rumor': is_rumor,
                        'confidence': confidence
                    }
                    print(f"[DEBUG] 基础C3N推理结果 - is_rumor: {is_rumor}, confidence: {confidence:.3f}")
                except Exception as e:
                    print(f"[DEBUG] C3N模型推理失败: {e}，使用增强检测器")

            # 使用增强检测器
            enhanced_detector = get_enhanced_detector(self.model)
            enhanced_result = enhanced_detector.detect(content, image_path, base_result)

            print(f"[DEBUG] 增强检测结果 - is_rumor: {enhanced_result['is_rumor']}, confidence: {enhanced_result['confidence']:.3f}")

            # 如果启用了目标检测，添加相关信息
            sources_checked = enhanced_result['sources_checked']
            reasoning = enhanced_result['reasoning']

            if self.object_detection_service and image_path:
                try:
                    image = Image.open(image_path).convert('RGB')
                    detection_info = self.object_detection_service.get_detection_info(image)
                    if detection_info['patch_count'] > 0:
                        sources_checked.append("目标检测分析")
                        reasoning.append(f"检测到{detection_info['patch_count']}个目标对象")
                except Exception as e:
                    print(f"[ObjectDetection] 目标检测失败: {e}")

            result = RumorDetectionResult(
                is_rumor=enhanced_result['is_rumor'],
                confidence=enhanced_result['confidence'],
                probability=enhanced_result['probability'],
                reasoning=reasoning,
                keywords=[],
                sources_checked=sources_checked,
                risk_level=enhanced_result['risk_level']
            )

            print(f"同步检测完成，结果: {'谣言' if enhanced_result['is_rumor'] else '非谣言'}, 置信度: {enhanced_result['confidence']:.3f}")

            return {
                "success": True,
                "is_rumor": enhanced_result['is_rumor'],
                "confidence": enhanced_result['confidence'],
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
        """准备模型输入数据 - 适配真实C3N模型"""
        # 文本预处理
        text_tensor = chinese_tokenize(content)
        text_input = text_tensor
        
        # 分割文本为句子
        sentences = split_text_to_sentences(content)
        if len(sentences) > 30:  # 限制句子数量
            sentences = sentences[:30]
        
        # 为每个句子创建token
        sentence_tokens = []
        for sentence in sentences:
            if sentence.strip():
                token = chinese_tokenize(sentence, context_length=20)
                sentence_tokens.append(token)
        
        # 如果句子数量不足，用空句子填充
        while len(sentence_tokens) < 30:
            empty_token = chinese_tokenize("", context_length=20)
            sentence_tokens.append(empty_token)
        
        # 堆叠句子tokens - 需要保持batch维度
        n_word_input = torch.cat(sentence_tokens, dim=0)  # [30, 20]
        n_word_input = n_word_input.unsqueeze(0)  # [1, 30, 20] - 添加batch维度
        
        # 图像预处理
        if image_path and os.path.exists(image_path):
            img = Image.open(image_path).convert("RGB")
            
            # 如果启用了目标检测，提取目标区域
            if self.object_detection_service:
                try:
                    od_config = get_object_detection_config()
                    patch_config = od_config.get_patch_config()
                    max_patches = patch_config['max_patches']
                    
                    patches = self.object_detection_service.detect_and_extract_patches(img, max_patches=max_patches)
                    if patches:
                        # 使用检测到的目标区域
                        crop_images = []
                        for patch in patches:
                            processed_patch = PREPROCESS(patch)
                            crop_images.append(processed_patch)
                        
                        # 如果目标数量不足，用原图填充
                        while len(crop_images) < 6:
                            crop_images.append(PREPROCESS(img))
                        
                        crop_images = crop_images[:6]  # 限制为6个
                    else:
                        # 没有检测到目标，使用原图
                        crop_images = [PREPROCESS(img)] * 6
                except Exception as e:
                    print(f"[ObjectDetection] 目标检测失败，使用原图: {e}")
                    crop_images = [PREPROCESS(img)] * 6
            else:
                # 没有目标检测，使用原图
                crop_images = [PREPROCESS(img)] * 6
        else:
            # 没有图像，使用零张量
            crop_images = [torch.zeros(3, 224, 224)] * 6
        
        # 准备图像输入 - [batch_size, num_crops, 3, 224, 224]
        crop_input = torch.stack(crop_images).unsqueeze(0)  # [1, 6, 3, 224, 224]
        
        # 移动到设备
        data = {
            'text_input': text_input.to(self.device),      # [1, 200]
            'crop_input': crop_input.to(self.device),      # [1, 6, 3, 224, 224]
            'n_word_input': n_word_input.to(self.device)   # [1, 30, 20]
        }
        
        return data

    def get_task_result(self, task_id: str) -> RumorDetectionTask:
        if task_id not in self.tasks:
            raise ValueError(f"任务不存在: {task_id}")
        return self.tasks[task_id]

    def _process_detection(self, task: RumorDetectionTask):
        """异步处理检测任务"""
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
            'success_rate': (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0,
            'object_detection_enabled': self.object_detection_service is not None
        }


# 全局服务实例
_rumor_service = None


def get_rumor_detection_service() -> RumorDetectionService:
    """获取图文谣言检测服务实例 (单例模式)"""
    global _rumor_service
    if _rumor_service is None:
        _rumor_service = RumorDetectionService()
    return _rumor_service 