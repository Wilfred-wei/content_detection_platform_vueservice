"""
图文谣言检测服务数据模型
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from dataclasses import dataclass
from typing import Optional, List, Dict, Any
from datetime import datetime
from shared.response_models import DetectionStatus


@dataclass
class RumorDetectionTask:
    """谣言检测任务"""
    task_id: str
    content: str
    image_path: Optional[str] = None
    status: str = DetectionStatus.PENDING
    result: Optional[Dict[str, Any]] = None
    confidence: Optional[float] = None
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now()
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        return {
            'task_id': self.task_id,
            'content': self.content,
            'image_path': self.image_path,
            'status': self.status,
            'result': self.result,
            'confidence': self.confidence,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'error_message': self.error_message
        }


@dataclass
class RumorDetectionResult:
    """谣言检测结果"""
    is_rumor: bool
    confidence: float
    probability: float
    reasoning: List[str]
    keywords: List[str]
    sources_checked: List[str]
    risk_level: str  # low, medium, high
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        return {
            'is_rumor': self.is_rumor,
            'confidence': self.confidence,
            'probability': self.probability,
            'reasoning': self.reasoning,
            'keywords': self.keywords,
            'sources_checked': self.sources_checked,
            'risk_level': self.risk_level
        } 