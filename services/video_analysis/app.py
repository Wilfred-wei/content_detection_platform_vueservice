from flask import Flask, send_from_directory
from config import Config
import os
from module1.routes import module1_bp
from module2.routes import module2_bp
# app.py 添加跨域支持
from flask_cors import CORS
from waitress import serve
#serve(app, host="0.0.0.0", port=5001)


app = Flask(__name__)

CORS(app)  # 允许所有域名跨域访问
app.config.from_object(Config)

# 注册模块路由 - 简化路径结构
app.register_blueprint(module1_bp, url_prefix='/module1')
app.register_blueprint(module2_bp, url_prefix='/module2')

# 确保目录存在
os.makedirs(app.config['MODULE1_UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['MODULE2_UPLOAD_FOLDER'], exist_ok=True)  # 模块二预留
os.makedirs(app.config['MODULE1_DATA_FOLDER'], exist_ok=True)
os.makedirs(app.config['MODULE2_DATA_FOLDER'], exist_ok=True)

# 添加静态视频文件服务
@app.route('/static/videos/<filename>')
def serve_example_video(filename):
    """提供示例视频文件服务"""
    # 视频文件存储在frontend/public/static/videos/目录
    video_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'frontend', 'public', 'static', 'videos')
    return send_from_directory(video_dir, filename)

# 添加健康检查端点
@app.route('/health', methods=['GET'])
def health_check():
    """健康检查端点"""
    return {
        "status": "healthy",
        "service": "视频分析服务",
        "version": "1.0.0",
        "modules": {
            "module1": "视频谣言检测",
            "module2": "视频语义理解"
        }
    }

@app.route('/')
def index():
    return "多模态视频分析平台"

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8003, debug=True)