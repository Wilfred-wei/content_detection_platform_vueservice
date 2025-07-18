"""
视频分析模块1数据模型
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from dataclasses import dataclass
from typing import Optional, Dict, Any, List
from datetime import datetime
from shared.response_models import DetectionStatus


@dataclass
class VideoAnalysisTask:
    """视频分析任务"""
    task_id: str
    video_path: str
    status: str = DetectionStatus.PENDING
    analysis_result: Optional[Dict[str, Any]] = None
    confidence: Optional[float] = None
    processing_time: Optional[float] = None
    
    # 视频元数据
    file_size: Optional[int] = None
    duration: Optional[float] = None
    resolution: Optional[str] = None
    fps: Optional[float] = None
    codec: Optional[str] = None
    
    # 时间戳
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now()
    
    @property
    def is_completed(self) -> bool:
        """分析是否已完成"""
        return self.status in [DetectionStatus.COMPLETED, DetectionStatus.FAILED]
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        return {
            'task_id': self.task_id,
            'video_path': self.video_path,
            'status': self.status,
            'analysis_result': self.analysis_result,
            'confidence': self.confidence,
            'processing_time': self.processing_time,
            'file_size': self.file_size,
            'duration': self.duration,
            'resolution': self.resolution,
            'fps': self.fps,
            'codec': self.codec,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'error_message': self.error_message
        }


@dataclass
class VideoAnalysisResult:
    """视频分析结果"""
    quality_score: float
    content_tags: List[str]
    scene_analysis: Dict[str, Any]
    objects_detected: List[Dict[str, Any]]
    summary: str
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        return {
            'quality_score': self.quality_score,
            'content_tags': self.content_tags,
            'scene_analysis': self.scene_analysis,
            'objects_detected': self.objects_detected,
            'summary': self.summary
        } 