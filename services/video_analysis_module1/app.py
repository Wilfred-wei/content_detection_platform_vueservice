"""
视频分析模块1服务 - 视频内容质量分析
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from flask import Flask, request
from werkzeug.exceptions import RequestEntityTooLarge
from shared.response_models import APIResponse
from shared.exceptions import ValidationException
from config import SERVICE_PORT, SERVICE_NAME, SERVICE_VERSION, MAX_CONTENT_LENGTH, UPLOAD_FOLDER, ALLOWED_EXTENSIONS
from services import get_video_analysis_module1_service


def create_app():
    """创建Flask应用"""
    app = Flask(__name__)
    
    # 基础配置
    app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH
    app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
    
    # 创建上传目录
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    
    return app


def allowed_file(filename):
    """检查文件扩展名是否允许"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


app = create_app()


@app.route('/health', methods=['GET'])
def health_check():
    """健康检查"""
    return APIResponse.success(
        data={
            "status": "healthy",
            "service": SERVICE_NAME,
            "version": SERVICE_VERSION
        }
    ).to_dict()


@app.route('/detect', methods=['POST'])
def analyze_video():
    """分析视频 (兼容API网关的detect端点名称)"""
    try:
        # 检查是否有文件上传
        if 'video' not in request.files:
            raise ValidationException("请上传视频文件")
        
        file = request.files['video']
        if file.filename == '':
            raise ValidationException("未选择文件")
        
        if not allowed_file(file.filename):
            raise ValidationException(
                f"不支持的文件格式，支持的格式: {', '.join(ALLOWED_EXTENSIONS)}"
            )
        
        # 获取服务实例
        service = get_video_analysis_module1_service()
        
        # 执行分析
        task = service.analyze_video(file)
        
        return APIResponse.success(
            data={
                "task_id": task.task_id,
                "status": task.status,
                "result": task.to_dict() if task.is_completed else None,
                "message": "分析完成" if task.is_completed else "分析进行中"
            },
            message="视频分析请求已处理"
        ).to_dict()
        
    except ValidationException as e:
        return APIResponse.error(
            message=e.message,
            code=400
        ).to_dict(), 400
        
    except Exception as e:
        return APIResponse.server_error(
            message=f"视频分析模块1服务异常: {str(e)}"
        ).to_dict(), 500


@app.route('/result/<task_id>', methods=['GET'])
def get_analysis_result(task_id):
    """获取分析结果"""
    try:
        service = get_video_analysis_module1_service()
        task = service.get_task_result(task_id)
        
        return APIResponse.success(
            data=task.to_dict(),
            message="获取结果成功"
        ).to_dict()
        
    except ValueError as e:
        return APIResponse.not_found(str(e)).to_dict(), 404
        
    except Exception as e:
        return APIResponse.server_error(
            message=f"获取结果失败: {str(e)}"
        ).to_dict(), 500


@app.route('/stats', methods=['GET'])
def get_service_stats():
    """获取服务统计信息"""
    try:
        service = get_video_analysis_module1_service()
        stats = service.get_service_stats()
        
        return APIResponse.success(
            data=stats,
            message="获取统计信息成功"
        ).to_dict()
        
    except Exception as e:
        return APIResponse.server_error(
            message=f"获取统计信息失败: {str(e)}"
        ).to_dict(), 500


@app.errorhandler(RequestEntityTooLarge)
def handle_file_too_large(e):
    """处理文件过大错误"""
    return APIResponse.error(
        message="上传文件过大",
        code=413
    ).to_dict(), 413


@app.errorhandler(404)
def handle_not_found(e):
    """处理404错误"""
    return APIResponse.not_found("接口不存在").to_dict(), 404


@app.errorhandler(500)
def handle_server_error(e):
    """处理500错误"""
    return APIResponse.server_error().to_dict(), 500


if __name__ == '__main__':
    print(f"[启动] {SERVICE_NAME} 启动在端口 {SERVICE_PORT}")
    print(f"[健康] 健康检查: http://localhost:{SERVICE_PORT}/health")
    print(f"[状态] 服务状态: http://localhost:{SERVICE_PORT}/stats")
    print("[注意] 这是框架实现，实际视频分析功能待开发")
    
    app.run(
        host='0.0.0.0',
        port=SERVICE_PORT,
        debug=True
    ) 