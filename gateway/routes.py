"""
API网关路由
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests
from flask import Blueprint, request, jsonify
from werkzeug.exceptions import RequestEntityTooLarge
from shared.response_models import APIResponse
from shared.utils import call_service_api, check_service_health
from config import SERVICES

api = Blueprint('api', __name__)


@api.route('/health', methods=['GET'])
def health_check():
    """网关健康检查"""
    return APIResponse.success(
        data={"status": "healthy", "service": "API Gateway"}
    ).to_dict()


@api.route('/services/status', methods=['GET'])
def services_status():
    """获取所有微服务状态"""
    services_health = {}
    
    for service_name, service_config in SERVICES.items():
        is_healthy = check_service_health(service_config['url'])
        services_health[service_name] = {
            'name': service_config['name'],
            'url': service_config['url'],
            'status': 'healthy' if is_healthy else 'unhealthy'
        }
    
    return APIResponse.success(
        data={"services": services_health}
    ).to_dict()


@api.route('/api/v1/rumor/detect', methods=['POST'])
def rumor_detection():
    """图文谣言检测代理"""
    try:
        service_url = SERVICES['rumor_detection']['url']
        
        # 转发请求到谣言检测服务
        response = call_service_api(
            service_url=service_url,
            endpoint='detect',
            method='POST',
            data=request.get_json()
        )
        
        return response
        
    except Exception as e:
        return APIResponse.error(
            message=f"谣言检测服务异常: {str(e)}",
            code=503
        ).to_dict(), 503


@api.route('/api/v1/ai-image/detect', methods=['POST'])
def ai_image_detection():
    """AI图像检测代理"""
    try:
        service_url = SERVICES['ai_image_detection']['url']
        
        # 处理文件上传
        files = {}
        data = {}
        
        if 'image' in request.files:
            uploaded_file = request.files['image']
            # 重置文件流位置并准备转发
            uploaded_file.seek(0)
            files['image'] = (
                uploaded_file.filename or 'image.png',
                uploaded_file.stream,
                uploaded_file.content_type or 'image/png'
            )
        
        # 获取其他表单数据
        for key, value in request.form.items():
            data[key] = value
        
        # 转发请求到AI图像检测服务
        response = call_service_api(
            service_url=service_url,
            endpoint='detect',
            method='POST',
            data=data,
            files=files
        )
        
        return response
        
    except Exception as e:
        return APIResponse.error(
            message=f"AI图像检测服务异常: {str(e)}",
            code=503
        ).to_dict(), 503


@api.route('/api/v1/ai-image/result/<task_id>', methods=['GET'])
def ai_image_result(task_id):
    """获取AI图像检测结果"""
    try:
        service_url = SERVICES['ai_image_detection']['url']
        
        response = call_service_api(
            service_url=service_url,
            endpoint=f'result/{task_id}',
            method='GET'
        )
        
        return response
        
    except Exception as e:
        return APIResponse.error(
            message=f"获取AI检测结果失败: {str(e)}",
            code=503
        ).to_dict(), 503


# === 视频分析API代理 ===

@api.route('/api/v1/video-analysis/module1/upload', methods=['POST'])
def video_analysis_module1_upload():
    """视频谣言检测单文件上传代理"""
    try:
        service_url = SERVICES['video_analysis']['url']
        
        # 处理文件上传
        files = {}
        data = {}
        
        if 'file' in request.files:
            uploaded_file = request.files['file']
            uploaded_file.seek(0)
            files['file'] = (
                uploaded_file.filename or 'video.mp4',
                uploaded_file.stream,
                uploaded_file.content_type or 'video/mp4'
            )
        
        # 获取其他表单数据
        for key, value in request.form.items():
            data[key] = value
        
        response = call_service_api(
            service_url=service_url,
            endpoint='module1/upload',
            method='POST',
            data=data,
            files=files
        )
        
        return response
        
    except Exception as e:
        return APIResponse.error(
            message=f"视频谣言检测服务异常: {str(e)}",
            code=503
        ).to_dict(), 503

@api.route('/api/v1/video-analysis/module1/uploads', methods=['POST'])
def video_analysis_module1_uploads():
    """视频谣言检测批量上传代理"""
    try:
        service_url = SERVICES['video_analysis']['url']
        
        files = {}
        data = {}
        
        if 'file' in request.files:
            uploaded_file = request.files['file']
            uploaded_file.seek(0)
            files['file'] = (
                uploaded_file.filename or 'video.mp4',
                uploaded_file.stream,
                uploaded_file.content_type or 'video/mp4'
            )
        
        for key, value in request.form.items():
            data[key] = value
        
        response = call_service_api(
            service_url=service_url,
            endpoint='module1/uploads',
            method='POST',
            data=data,
            files=files
        )
        
        return response
        
    except Exception as e:
        return APIResponse.error(
            message=f"视频谣言检测批量上传异常: {str(e)}",
            code=503
        ).to_dict(), 503

@api.route('/api/v1/video-analysis/module1/history', methods=['GET'])
def video_analysis_module1_history():
    """获取视频谣言检测历史记录"""
    try:
        service_url = SERVICES['video_analysis']['url']
        
        response = call_service_api(
            service_url=service_url,
            endpoint='module1/history',
            method='GET'
        )
        
        return response
        
    except Exception as e:
        return APIResponse.error(
            message=f"获取历史记录失败: {str(e)}",
            code=503
        ).to_dict(), 503

@api.route('/api/v1/video-analysis/module1/history', methods=['DELETE'])
def video_analysis_module1_delete_all_history():
    """删除所有视频谣言检测历史记录"""
    try:
        service_url = SERVICES['video_analysis']['url']
        
        response = call_service_api(
            service_url=service_url,
            endpoint='module1/history',
            method='DELETE'
        )
        
        return response
        
    except Exception as e:
        return APIResponse.error(
            message=f"删除历史记录失败: {str(e)}",
            code=503
        ).to_dict(), 503

@api.route('/api/v1/video-analysis/module1/history/<string:record_id>', methods=['GET'])
def video_analysis_module1_get_history(record_id):
    """获取单个视频谣言检测历史记录详情"""
    try:
        service_url = SERVICES['video_analysis']['url']
        
        response = call_service_api(
            service_url=service_url,
            endpoint=f'module1/history/{record_id}',
            method='GET'
        )
        
        return response
        
    except Exception as e:
        return APIResponse.error(
            message=f"获取记录详情失败: {str(e)}",
            code=503
        ).to_dict(), 503

@api.route('/api/v1/video-analysis/module1/history/<string:record_id>', methods=['DELETE'])
def video_analysis_module1_delete_history(record_id):
    """删除单个视频谣言检测历史记录"""
    try:
        service_url = SERVICES['video_analysis']['url']
        
        response = call_service_api(
            service_url=service_url,
            endpoint=f'module1/history/{record_id}',
            method='DELETE'
        )
        
        return response
        
    except Exception as e:
        return APIResponse.error(
            message=f"删除记录失败: {str(e)}",
            code=503
        ).to_dict(), 503

# === 视频语义理解API代理 ===

@api.route('/api/v1/video-analysis/module2/upload', methods=['POST'])
def video_analysis_module2_upload():
    """视频语义理解单文件上传代理"""
    try:
        service_url = SERVICES['video_analysis']['url']
        
        files = {}
        data = {}
        
        if 'file' in request.files:
            uploaded_file = request.files['file']
            uploaded_file.seek(0)
            files['file'] = (
                uploaded_file.filename or 'video.mp4',
                uploaded_file.stream,
                uploaded_file.content_type or 'video/mp4'
            )
        
        for key, value in request.form.items():
            data[key] = value
        
        response = call_service_api(
            service_url=service_url,
            endpoint='module2/upload',
            method='POST',
            data=data,
            files=files
        )
        
        return response
        
    except Exception as e:
        return APIResponse.error(
            message=f"视频语义理解服务异常: {str(e)}",
            code=503
        ).to_dict(), 503

@api.route('/api/v1/video-analysis/module2/uploads', methods=['POST'])
def video_analysis_module2_uploads():
    """视频语义理解批量上传代理"""
    try:
        service_url = SERVICES['video_analysis']['url']
        
        files = {}
        data = {}
        
        if 'file' in request.files:
            uploaded_file = request.files['file']
            uploaded_file.seek(0)
            files['file'] = (
                uploaded_file.filename or 'video.mp4',
                uploaded_file.stream,
                uploaded_file.content_type or 'video/mp4'
            )
        
        for key, value in request.form.items():
            data[key] = value
        
        response = call_service_api(
            service_url=service_url,
            endpoint='module2/uploads',
            method='POST',
            data=data,
            files=files
        )
        
        return response
        
    except Exception as e:
        return APIResponse.error(
            message=f"视频语义理解批量上传异常: {str(e)}",
            code=503
        ).to_dict(), 503

@api.route('/api/v1/video-analysis/module2/history', methods=['GET'])
def video_analysis_module2_history():
    """获取视频语义理解历史记录"""
    try:
        service_url = SERVICES['video_analysis']['url']
        
        response = call_service_api(
            service_url=service_url,
            endpoint='module2/history',
            method='GET'
        )
        
        return response
        
    except Exception as e:
        return APIResponse.error(
            message=f"获取历史记录失败: {str(e)}",
            code=503
        ).to_dict(), 503

@api.route('/api/v1/video-analysis/module2/history', methods=['DELETE'])
def video_analysis_module2_delete_all_history():
    """删除所有视频语义理解历史记录"""
    try:
        service_url = SERVICES['video_analysis']['url']
        
        response = call_service_api(
            service_url=service_url,
            endpoint='module2/history',
            method='DELETE'
        )
        
        return response
        
    except Exception as e:
        return APIResponse.error(
            message=f"删除历史记录失败: {str(e)}",
            code=503
        ).to_dict(), 503

@api.route('/api/v1/video-analysis/module2/history/<string:record_id>', methods=['GET'])
def video_analysis_module2_get_history(record_id):
    """获取单个视频语义理解历史记录详情"""
    try:
        service_url = SERVICES['video_analysis']['url']
        
        response = call_service_api(
            service_url=service_url,
            endpoint=f'module2/history/{record_id}',
            method='GET'
        )
        
        return response
        
    except Exception as e:
        return APIResponse.error(
            message=f"获取记录详情失败: {str(e)}",
            code=503
        ).to_dict(), 503

@api.route('/api/v1/video-analysis/module2/history/<string:record_id>', methods=['DELETE'])
def video_analysis_module2_delete_history(record_id):
    """删除单个视频语义理解历史记录"""
    try:
        service_url = SERVICES['video_analysis']['url']
        
        response = call_service_api(
            service_url=service_url,
            endpoint=f'module2/history/{record_id}',
            method='DELETE'
        )
        
        return response
        
    except Exception as e:
        return APIResponse.error(
            message=f"删除记录失败: {str(e)}",
            code=503
        ).to_dict(), 503

# === 视频静态文件代理 ===

@api.route('/api/v1/video-analysis/static/videos/<filename>')
def video_analysis_static_videos(filename):
    """视频静态文件代理"""
    try:
        service_url = SERVICES['video_analysis']['url']
        
        response = call_service_api(
            service_url=service_url,
            endpoint=f'static/videos/{filename}',
            method='GET'
        )
        
        return response
        
    except Exception as e:
        return APIResponse.error(
            message=f"获取静态视频文件失败: {str(e)}",
            code=503
        ).to_dict(), 503


@api.errorhandler(RequestEntityTooLarge)
def handle_file_too_large(e):
    """处理文件过大错误"""
    return APIResponse.error(
        message="上传文件过大",
        code=413
    ).to_dict(), 413


@api.errorhandler(404)
def handle_not_found(e):
    """处理404错误"""
    return APIResponse.not_found("接口不存在").to_dict(), 404


@api.errorhandler(500)
def handle_server_error(e):
    """处理500错误"""
    return APIResponse.server_error("服务器内部错误").to_dict(), 500 