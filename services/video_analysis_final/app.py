from flask import Flask
from config import Config
import os
from module1.routes import module1_bp
from module2.routes import module2_bp
from module3.routes import module3_bp
# app.py 添加跨域支持
from flask_cors import CORS
from waitress import serve
#serve(app, host="0.0.0.0", port=5001)
app = Flask(__name__)
CORS(app) # 允许所有域名跨域访问
app.config.from_object(Config)
# 注册路由
app.register_blueprint(module1_bp, url_prefix='/video_analysis/module1')
app.register_blueprint(module2_bp, url_prefix='/video_analysis/module2')
app.register_blueprint(module3_bp, url_prefix='/video_analysis/module3')
# 确保目录存在
os.makedirs(app.config['MODULE1_UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['MODULE2_UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['MODULE3_VIDEO_FOLDER'], exist_ok=True) 
os.makedirs(app.config['MODULE1_DATA_FOLDER'], exist_ok=True)
os.makedirs(app.config['MODULE2_DATA_FOLDER'], exist_ok=True)
os.makedirs(app.config['MODULE3_DATA_FOLDER'], exist_ok=True)
@app.route('/')
def index():
    return "多模态视频分析平台"
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=28003,debug=True)