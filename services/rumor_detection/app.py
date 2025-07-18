"""
图文谣言检测服务
"""
import sys
import os
import time
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from flask import Flask, request, jsonify
from werkzeug.exceptions import RequestEntityTooLarge
from shared.response_models import APIResponse
from shared.exceptions import ValidationException, ProcessingException
from config import SERVICE_PORT, SERVICE_NAME, SERVICE_VERSION, MAX_CONTENT_LENGTH, UPLOAD_FOLDER
from services import get_rumor_detection_service


def create_app():
    """创建Flask应用"""
    app = Flask(__name__)
    
    # 基础配置
    app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH
    app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
    
    # 创建上传目录
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    
    return app


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
def detect_rumor():
    """检测谣言"""
    try:
        print("[DEBUG] 收到/detect请求")
        content = request.form.get('content', '').strip()
        image_file = request.files.get('image')
        print(f"[DEBUG] content: {content}")
        print(f"[DEBUG] image_file: {image_file}")
        if not content:
            print("[DEBUG] 缺少文本内容")
            raise ValidationException("文本内容不能为空")
        if not image_file:
            print("[DEBUG] 缺少图片文件")
            raise ValidationException("必须上传图片，图文结合检测")
        if len(content) < 5:
            print("[DEBUG] 文本内容过短")
            raise ValidationException("文本内容过于简短")
        if len(content) > 10000:
            print("[DEBUG] 文本内容过长")
            raise ValidationException("文本内容过长，最大支持10000字符")
        ext = os.path.splitext(image_file.filename)[-1].lower()
        filename = f"rumor_{int(time.time())}{ext}"
        save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        print(f"[DEBUG] 保存图片到: {save_path}")
        image_file.save(save_path)
        image_path = save_path
        print(f"[DEBUG] 调用service.detect_rumor_sync(content, image_path)")
        service = get_rumor_detection_service()
        result = service.detect_rumor_sync(content, image_path)
        print(f"[DEBUG] 同步检测完成，结果: {result}")
        return jsonify(result)
    except ValidationException as e:
        print(f"[DEBUG] 参数校验失败: {e}")
        return jsonify({
            "success": False,
            "message": e.message,
            "error": "参数校验失败"
        }), 400
    except Exception as e:
        import traceback
        print(f"[DEBUG] 未知异常: {e}")
        traceback.print_exc()
        return jsonify({
            "success": False,
            "message": f"谣言检测服务异常: {str(e)}",
            "error": str(e)
        }), 500


@app.route('/result/<task_id>', methods=['GET'])
def get_detection_result(task_id):
    """获取检测结果"""
    try:
        service = get_rumor_detection_service()
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
        service = get_rumor_detection_service()
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
        message="请求数据过大",
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
    
    app.run(
        host='0.0.0.0',
        port=SERVICE_PORT,
        debug=True
    ) 