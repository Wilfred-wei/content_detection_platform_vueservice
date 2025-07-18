"""
统一的API响应格式
"""
from typing import Any, Optional, Dict
from datetime import datetime
import json


class APIResponse:
    """标准API响应格式"""
    
    def __init__(
        self, 
        success: bool = True, 
        data: Any = None, 
        message: str = "操作成功",
        code: int = 200,
        errors: Optional[Dict] = None
    ):
        self.success = success
        self.data = data
        self.message = message
        self.code = code
        self.errors = errors or {}
        self.timestamp = datetime.now().isoformat()
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        result = {
            "success": self.success,
            "message": self.message,
            "code": self.code,
            "timestamp": self.timestamp
        }
        
        if self.success:
            result["data"] = self.data
        else:
            result["errors"] = self.errors
            
        return result
    
    def to_json(self) -> str:
        """转换为JSON字符串"""
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)
    
    @classmethod
    def success(cls, data: Any = None, message: str = "操作成功") -> "APIResponse":
        """创建成功响应"""
        return cls(success=True, data=data, message=message, code=200)
    
    @classmethod
    def error(cls, message: str = "操作失败", code: int = 400, errors: Optional[Dict] = None) -> "APIResponse":
        """创建错误响应"""
        return cls(success=False, message=message, code=code, errors=errors)
    
    @classmethod
    def not_found(cls, message: str = "资源不存在") -> "APIResponse":
        """创建404响应"""
        return cls(success=False, message=message, code=404)
    
    @classmethod
    def server_error(cls, message: str = "服务器内部错误") -> "APIResponse":
        """创建500响应"""
        return cls(success=False, message=message, code=500)


# 检测任务状态枚举
class DetectionStatus:
    PENDING = "pending"
    PROCESSING = "processing" 
    COMPLETED = "completed"
    FAILED = "failed"


# 检测类型枚举
class DetectionType:
    RUMOR = "rumor"
    AI_IMAGE = "ai_image"
    VIDEO_MODULE1 = "video_module1"
    VIDEO_MODULE2 = "video_module2" 