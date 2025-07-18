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


@api.route('/api/v1/video-analysis/module1/detect', methods=['POST'])
def video_analysis_module1():
    """视频分析模块1代理"""
    try:
        service_url = SERVICES['video_analysis_module1']['url']
        
        # 处理文件上传
        files = {}
        data = {}
        
        if 'video' in request.files:
            files['video'] = request.files['video']
        
        for key, value in request.form.items():
            data[key] = value
        
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
            message=f"视频分析模块1服务异常: {str(e)}",
            code=503
        ).to_dict(), 503


@api.route('/api/v1/video-analysis/module2/detect', methods=['POST'])
def video_analysis_module2():
    """视频分析模块2代理"""
    try:
        service_url = SERVICES['video_analysis_module2']['url']
        
        # 处理文件上传
        files = {}
        data = {}
        
        if 'video' in request.files:
            files['video'] = request.files['video']
        
        for key, value in request.form.items():
            data[key] = value
        
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
            message=f"视频分析模块2服务异常: {str(e)}",
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