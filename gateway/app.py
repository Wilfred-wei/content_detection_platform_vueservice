"""
API网关主应用
统一的入口点，负责路由转发到各个微服务
"""
import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask
from flask_cors import CORS
from routes import api
from config import GATEWAY_PORT, CORS_ORIGINS, MAX_CONTENT_LENGTH, UPLOAD_FOLDER


def create_app():
    """创建Flask应用"""
    app = Flask(__name__)
    
    # 基础配置
    app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH
    app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
    
    # 创建上传目录
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    
    # CORS配置
    CORS(app, origins=CORS_ORIGINS, supports_credentials=True)
    
    # 注册蓝图
    app.register_blueprint(api)
    
    return app


if __name__ == '__main__':
    app = create_app()
    print(f"[启动] API网关启动在端口 {GATEWAY_PORT}")
    print(f"[状态] 访问服务状态: http://localhost:{GATEWAY_PORT}/services/status")
    print(f"[健康] 健康检查: http://localhost:{GATEWAY_PORT}/health")
    
    app.run(
        host='0.0.0.0',
        port=GATEWAY_PORT,
        debug=True
    ) 