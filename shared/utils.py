"""
共享工具函数
"""
import uuid
import os
import hashlib
from typing import Optional, Dict, Any
import requests
from datetime import datetime


def generate_task_id() -> str:
    """生成唯一任务ID"""
    return str(uuid.uuid4())


def get_file_hash(file_path: str) -> str:
    """计算文件MD5哈希值"""
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()


def format_file_size(size_bytes: int) -> str:
    """格式化文件大小"""
    if size_bytes == 0:
        return "0B"
    
    size_names = ["B", "KB", "MB", "GB"]
    i = 0
    while size_bytes >= 1024 and i < len(size_names) - 1:
        size_bytes /= 1024.0
        i += 1
    
    return f"{size_bytes:.2f}{size_names[i]}"


def check_service_health(service_url: str, timeout: int = 5) -> bool:
    """检查服务健康状态"""
    try:
        response = requests.get(f"{service_url}/health", timeout=timeout)
        return response.status_code == 200
    except:
        return False


def call_service_api(
    service_url: str, 
    endpoint: str, 
    method: str = "POST", 
    data: Optional[Dict] = None,
    files: Optional[Dict] = None,
    timeout: int = 30
) -> Dict[str, Any]:
    """调用其他微服务API"""
    url = f"{service_url.rstrip('/')}/{endpoint.lstrip('/')}"
    
    try:
        if method.upper() == "POST":
            if files:
                response = requests.post(url, data=data, files=files, timeout=timeout)
            else:
                response = requests.post(url, json=data, timeout=timeout)
        elif method.upper() == "GET":
            response = requests.get(url, params=data, timeout=timeout)
        else:
            raise ValueError(f"不支持的HTTP方法: {method}")
        
        response.raise_for_status()
        return response.json()
        
    except requests.exceptions.Timeout:
        raise Exception("请求超时")
    except requests.exceptions.ConnectionError:
        raise Exception("服务连接失败")
    except requests.exceptions.HTTPError as e:
        raise Exception(f"HTTP错误: {e.response.status_code}")
    except Exception as e:
        raise Exception(f"请求失败: {str(e)}")


def validate_image_file(file_path: str) -> tuple[bool, str]:
    """验证图像文件"""
    if not os.path.exists(file_path):
        return False, "文件不存在"
    
    # 检查文件大小 (最大10MB)
    max_size = 10 * 1024 * 1024
    if os.path.getsize(file_path) > max_size:
        return False, f"文件大小超过限制({format_file_size(max_size)})"
    
    # 检查文件扩展名
    allowed_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'}
    file_ext = os.path.splitext(file_path)[1].lower()
    if file_ext not in allowed_extensions:
        return False, f"不支持的文件格式: {file_ext}"
    
    return True, ""


def validate_video_file(file_path: str) -> tuple[bool, str]:
    """验证视频文件"""
    if not os.path.exists(file_path):
        return False, "文件不存在"
    
    # 检查文件大小 (最大100MB)
    max_size = 100 * 1024 * 1024
    if os.path.getsize(file_path) > max_size:
        return False, f"文件大小超过限制({format_file_size(max_size)})"
    
    # 检查文件扩展名
    allowed_extensions = {'.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv'}
    file_ext = os.path.splitext(file_path)[1].lower()
    if file_ext not in allowed_extensions:
        return False, f"不支持的文件格式: {file_ext}"
    
    return True, "" 