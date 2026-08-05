"""
API网关路由
"""
import sys
import os
from urllib.parse import quote
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests
from flask import Blueprint, Response, request, jsonify
from werkzeug.exceptions import RequestEntityTooLarge
from shared.response_models import APIResponse
from shared.utils import call_service_api, check_service_health
from config import SERVICES

api = Blueprint('api', __name__)


def _proxy_agent(endpoint, method='GET', data=None, timeout=120):
    """Forward Agent JSON APIs while preserving typed upstream responses."""
    service_url = SERVICES['detection_agent']['url'].rstrip('/')
    forward_headers = {}
    for header in ('Authorization', 'X-Agent-Scope', 'X-Request-ID'):
        value = request.headers.get(header)
        if value:
            forward_headers[header] = value
    response = requests.request(
        method=method,
        url=f"{service_url}/{endpoint.lstrip('/')}",
        json=data,
        timeout=timeout,
        headers=forward_headers,
    )
    try:
        payload = response.json()
    except ValueError:
        payload = {
            'error': {
                'code': 'INVALID_AGENT_RESPONSE',
                'message': 'Agent服务返回了无效响应'
            }
        }
    proxied = jsonify(payload)
    proxied.headers['Cache-Control'] = response.headers.get('Cache-Control', 'no-store')
    return proxied, response.status_code


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


# === Detection Agent API ===

@api.route('/api/v1/agent/health', methods=['GET'])
def detection_agent_health():
    try:
        return _proxy_agent('health')
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/capabilities', methods=['GET'])
def detection_agent_capabilities():
    try:
        return _proxy_agent('v1/capabilities')
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/provenance/registry', methods=['GET'])
def detection_agent_provenance_registry():
    try:
        return _proxy_agent('v1/provenance/registry')
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/models/registry', methods=['GET'])
def detection_agent_model_registry():
    try:
        return _proxy_agent('v1/models/registry')
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/models/runtime', methods=['GET'])
def detection_agent_model_runtime():
    try:
        return _proxy_agent('v1/models/runtime')
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/release/readiness', methods=['GET'])
def detection_agent_release_readiness():
    try:
        return _proxy_agent('v1/release/readiness')
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/config', methods=['GET', 'PUT'])
def detection_agent_config():
    try:
        if request.method == 'PUT':
            return _proxy_agent(
                'v1/config',
                method='PUT',
                data=request.get_json(silent=True) or {}
            )
        return _proxy_agent('v1/config')
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/config/test', methods=['POST'])
def detection_agent_test_config():
    try:
        return _proxy_agent(
            'v1/config/test',
            method='POST',
            data=request.get_json(silent=True) or {}
        )
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/sessions', methods=['POST'])
def detection_agent_create_session():
    try:
        return _proxy_agent('v1/sessions', method='POST', data=request.get_json(silent=True) or {})
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/sessions/<string:session_id>', methods=['GET'])
def detection_agent_get_session(session_id):
    try:
        return _proxy_agent(f'v1/sessions/{session_id}')
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/sessions/<string:session_id>/messages', methods=['GET', 'POST'])
def detection_agent_messages(session_id):
    try:
        if request.method == 'POST':
            return _proxy_agent(
                f'v1/sessions/{session_id}/messages',
                method='POST',
                data=request.get_json(silent=True) or {}
            )
        return _proxy_agent(f'v1/sessions/{session_id}/messages')
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/sessions/<string:session_id>/cancel', methods=['POST'])
def detection_agent_cancel(session_id):
    try:
        return _proxy_agent(f'v1/sessions/{session_id}/cancel', method='POST', data={})
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/analyses', methods=['POST'])
def detection_agent_create_analysis():
    try:
        return _proxy_agent(
            'v1/analyses',
            method='POST',
            data=request.get_json(silent=True) or {},
            timeout=30
        )
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/analyses/<string:analysis_id>', methods=['GET'])
def detection_agent_get_analysis(analysis_id):
    try:
        return _proxy_agent(f'v1/analyses/{analysis_id}')
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/analyses/<string:analysis_id>/evidence', methods=['GET'])
def detection_agent_get_evidence(analysis_id):
    try:
        return _proxy_agent(f'v1/analyses/{analysis_id}/evidence')
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/analyses/<string:analysis_id>/report', methods=['GET'])
def detection_agent_get_report(analysis_id):
    try:
        return _proxy_agent(f'v1/analyses/{analysis_id}/report')
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/analyses/<string:analysis_id>/retry', methods=['POST'])
def detection_agent_retry_analysis(analysis_id):
    try:
        return _proxy_agent(f'v1/analyses/{analysis_id}/retry', method='POST', data={})
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/analyses/<string:analysis_id>/cancel', methods=['POST'])
def detection_agent_cancel_analysis(analysis_id):
    try:
        return _proxy_agent(f'v1/analyses/{analysis_id}/cancel', method='POST', data={})
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/analyses/<string:analysis_id>/progress', methods=['GET'])
def detection_agent_analysis_progress(analysis_id):
    try:
        cursor = request.args.get('cursor', '0')
        safe_cursor = quote(cursor, safe='0123456789')
        return _proxy_agent(f'v1/analyses/{analysis_id}/progress?cursor={safe_cursor}')
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/analyses/<string:analysis_id>/export', methods=['GET'])
def detection_agent_analysis_export(analysis_id):
    try:
        return _proxy_agent(f'v1/analyses/{analysis_id}/export')
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/analyses/<string:analysis_id>/asset', methods=['DELETE'])
def detection_agent_delete_asset(analysis_id):
    try:
        return _proxy_agent(f'v1/analyses/{analysis_id}/asset', method='DELETE', data={})
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/queue', methods=['GET'])
def detection_agent_queue():
    try:
        return _proxy_agent('v1/queue')
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/metrics', methods=['GET'])
def detection_agent_metrics():
    try:
        return _proxy_agent('v1/metrics')
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


@api.route('/api/v1/agent/analyses/<string:analysis_id>/asset', methods=['GET'])
def detection_agent_get_asset(analysis_id):
    try:
        service_url = SERVICES['detection_agent']['url'].rstrip('/')
        upstream = requests.get(
            f'{service_url}/v1/analyses/{analysis_id}/asset',
            timeout=30,
            headers={name: request.headers[name] for name in ('Authorization', 'X-Agent-Scope') if request.headers.get(name)}
        )
        headers = {
            name: value for name, value in upstream.headers.items()
            if name.lower() in {
                'content-type', 'content-length', 'cache-control',
                'content-disposition', 'x-content-type-options'
            }
        }
        return Response(upstream.content, status=upstream.status_code, headers=headers)
    except requests.exceptions.RequestException as error:
        return jsonify({'error': {'code': 'AGENT_UNAVAILABLE', 'message': str(error)}}), 503


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
