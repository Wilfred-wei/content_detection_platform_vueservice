"""
统一异常处理
"""


class BaseServiceException(Exception):
    """基础服务异常"""
    
    def __init__(self, message: str, code: int = 400):
        self.message = message
        self.code = code
        super().__init__(self.message)


class ValidationException(BaseServiceException):
    """数据验证异常"""
    
    def __init__(self, message: str = "数据验证失败", errors: dict = None):
        super().__init__(message, 400)
        self.errors = errors or {}


class ServiceUnavailableException(BaseServiceException):
    """服务不可用异常"""
    
    def __init__(self, message: str = "服务暂时不可用"):
        super().__init__(message, 503)


class ResourceNotFoundException(BaseServiceException):
    """资源不存在异常"""
    
    def __init__(self, message: str = "资源不存在"):
        super().__init__(message, 404)


class ProcessingException(BaseServiceException):
    """处理过程异常"""
    
    def __init__(self, message: str = "处理失败"):
        super().__init__(message, 500) 