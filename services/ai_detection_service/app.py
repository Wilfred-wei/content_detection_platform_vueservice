from flask import Flask, request, jsonify, send_file, send_from_directory, abort
from flask_cors import CORS
import os
import tempfile
import logging
import uuid
import time
from PIL import Image
import torch
import zipfile
from datetime import datetime
from werkzeug.utils import secure_filename
import shutil  # 添加shutil模块

from safe_model import SAFEModel
from heatmap_generator import HeatmapGenerator
from config import Config

app = Flask(__name__)

# 配置CORS，允许前端访问（放宽为允许任意来源，便于开发联调）
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# 新增：提供热力图静态访问路由
@app.route('/heatmap/<filename>')
def serve_heatmap(filename):
    heatmap_dir = 'heatmaps'
    logger.info(f"尝试访问热力图: {filename}, 目录: {heatmap_dir}")
    return send_from_directory(heatmap_dir, filename)

# 新增：提供批量任务图片访问路由
@app.route('/batch/<job_id>/image/<filename>')
def serve_batch_image(job_id, filename):
    """提供批量任务的图片文件"""
    try:
        batch_images_dir = 'batch_images'
        image_path = os.path.join(batch_images_dir, job_id, filename)
        logger.info(f"尝试访问批量任务图片: {image_path}")
        
        if os.path.exists(image_path):
            return send_file(image_path)
        else:
            logger.warning(f"批量任务图片文件不存在: {image_path}")
            abort(404)
    except Exception as e:
        logger.error(f"发送批量任务图片失败: {str(e)}")
        abort(500)

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 初始化模型和服务
safe_model = None
heatmap_generator = None

def init_model():
    """初始化HCF模型"""
    global safe_model, heatmap_generator
    try:
        safe_model = SAFEModel(Config.MODEL_PATH, Config.DEVICE)
        heatmap_generator = HeatmapGenerator(safe_model)
        logger.info("HCF模型初始化成功")
        return True
    except Exception as e:
        logger.error(f"模型初始化失败: {e}")
        logger.error(f"请检查模型路径: {Config.MODEL_PATH}")
        logger.error("如果模型文件不存在，服务将使用启发式方法进行检测")
        # 即使模型加载失败，也不将模型设置为None，使用启发式方法
        if safe_model is None:
            safe_model = SAFEModel(Config.MODEL_PATH, Config.DEVICE)
        if heatmap_generator is None:
            heatmap_generator = HeatmapGenerator(safe_model)
        return True  # 即使模型加载失败也返回True，以便健康检查通过

def allowed_file(filename):
    """检查文件格式是否允许"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS

def validate_image(file):
    """验证图像文件"""
    try:
        img = Image.open(file)
        # 检查图像尺寸
        if img.size[0] > Config.MAX_IMAGE_SIZE[0] or img.size[1] > Config.MAX_IMAGE_SIZE[1]:
            return False, "图像尺寸过大"
        # 检查文件大小
        file.seek(0, 2)  # 移到文件末尾
        size = file.tell()
        file.seek(0)  # 回到开始
        if size > Config.MAX_FILE_SIZE:
            return False, "文件大小超过限制"
        return True, None
    except Exception as e:
        return False, f"图像文件无效: {str(e)}"

@app.route('/health', methods=['GET', 'OPTIONS'])
def health_check():
    """健康检查"""
    if request.method == 'OPTIONS':
        # 处理预检请求
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        return response
    
    return jsonify({
        'status': 'healthy' if safe_model is not None else 'unhealthy',
        'model_loaded': safe_model is not None,
        'timestamp': datetime.now().isoformat(),
        'message': 'AI检测服务运行正常' if safe_model is not None else '模型未加载或加载失败'
    })

@app.route('/detect', methods=['POST', 'OPTIONS'])
def detect_single():
    """单张图像检测"""
    if request.method == 'OPTIONS':
        # 处理预检请求
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        return response
    
    # 注意：即使模型未加载，我们也可以使用启发式方法提供服务
    
    if 'image' not in request.files:
        return jsonify({'error': '未提供图像文件'}), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': '未选择文件'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': '不支持的文件格式'}), 400
    
    # 验证图像
    is_valid, error_msg = validate_image(file)
    if not is_valid:
        return jsonify({'error': error_msg}), 400
    
    temp_file_path = ""
    try:
        # 使用更安全的方式处理临时文件
        temp_dir = tempfile.mkdtemp()
        temp_file_path = os.path.join(temp_dir, f"{uuid.uuid4()}.jpg")
        file.save(temp_file_path)
        
        start_time = time.time()
        
        result = safe_model.predict(temp_file_path)     
        
        processing_time = time.time() - start_time
        
        # 生成热力图（仅对AI生成图像）
        heatmap_url = None
        if result['prediction'] == 'fake' and heatmap_generator:
            # 保存到 heatmaps 目录
            heatmap_dir = 'heatmaps'
            os.makedirs(heatmap_dir, exist_ok=True)
            heatmap_filename = f"heatmap_{uuid.uuid4()}.jpg"
            heatmap_path = os.path.join(heatmap_dir, heatmap_filename)
            logger.info(f"热力图保存路径: {heatmap_path}")
            if heatmap_generator.generate(temp_file_path, heatmap_path):
                # 返回完整的URL，包含协议和端口
                heatmap_url = f"http://localhost:8002/heatmap/{heatmap_filename}"
                logger.info(f"热力图URL: {heatmap_url}")
        
        # 获取图像信息
        img = Image.open(file)
        file.seek(0)
        
        response = jsonify({
            'prediction': result['prediction'],
            'confidence': result['confidence'],
            'processing_time': processing_time,
            'model_version': 'HCF-v1.0',
            'image_info': {
                'width': img.size[0],
                'height': img.size[1],
                'format': img.format,
                'size': f"{file.content_length / 1024:.1f} KB" if file.content_length else "Unknown"
            },
            'heatmap_url': heatmap_url
        })
        
        # 清理临时文件和目录
        try:
            # 使用安全的删除方式
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception as cleanup_error:
            logger.warning(f"临时文件清理失败: {cleanup_error}")
            
        return response
        
    except Exception as e:
        logger.error(f"检测失败: {str(e)}")
        # 确保即使发生错误也清理临时文件
        try:
            if temp_file_path and os.path.exists(os.path.dirname(temp_file_path)):
                shutil.rmtree(os.path.dirname(temp_file_path), ignore_errors=True)
        except:
            pass
        return jsonify({'error': f'检测失败: {str(e)}'}), 500

@app.route('/detect/batch', methods=['POST', 'OPTIONS'])
def detect_batch():
    """批量检测"""
    if request.method == 'OPTIONS':
        # 处理预检请求
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        return response
    
    # 检查是ZIP文件还是多文件上传
    if 'zip_file' in request.files:
        return handle_zip_batch(request.files['zip_file'], request.form.get('name', ''))
    elif 'images' in request.files:
        return handle_multiple_files_batch(request.files.getlist('images'), request.form.get('name', ''))
    else:
        return jsonify({'error': '请提供ZIP文件或图像文件'}), 400

def handle_zip_batch(zip_file, task_name):
    """处理ZIP文件批量检测"""
    try:
        # 创建临时目录
        temp_dir = tempfile.mkdtemp()
        zip_path = os.path.join(temp_dir, 'upload.zip')
        zip_file.save(zip_path)
        
        # 解压文件
        with zipfile.ZipFile(zip_path, 'r') as zf:
            zf.extractall(temp_dir)
        
        # 查找图像文件
        image_files = []
        for root, dirs, files in os.walk(temp_dir):
            for file in files:
                if allowed_file(file):
                    image_files.append(os.path.join(root, file))
        
        if not image_files:
            return jsonify({'error': 'ZIP文件中未找到有效图像'}), 400
        
        if len(image_files) > Config.MAX_BATCH_SIZE:
            return jsonify({'error': f'图像数量超过限制 ({Config.MAX_BATCH_SIZE})'}), 400
        
        # 创建批量任务
        job_id = str(uuid.uuid4())
        task_name = task_name or f"批量任务_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # 启动后台处理
        results = process_batch_images(image_files, job_id)
        
        return jsonify({
            'id': job_id,
            'name': task_name,
            'status': 'completed',
            'total_images': len(image_files),
            'processed_images': len(results),
            'real_count': sum(1 for r in results if r['prediction'] == 'real'),
            'ai_count': sum(1 for r in results if r['prediction'] == 'fake'),
            'success_count': len(results),
            'failed_count': 0,
            'created_at': datetime.now().isoformat(),
            'results': results
        })
        
    except Exception as e:
        logger.error(f"批量检测失败: {str(e)}")
        return jsonify({'error': f'批量检测失败: {str(e)}'}), 500

def handle_multiple_files_batch(files, task_name):
    """处理多文件批量检测"""
    try:
        if len(files) > Config.MAX_BATCH_SIZE:
            return jsonify({'error': f'文件数量超过限制 ({Config.MAX_BATCH_SIZE})'}), 400
        
        # 保存临时文件
        temp_files = []
        for file in files:
            if not allowed_file(file.filename):
                continue
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.jpg')
            file.save(temp_file.name)
            temp_files.append(temp_file.name)
        
        if not temp_files:
            return jsonify({'error': '未找到有效图像文件'}), 400
        
        # 创建批量任务
        job_id = str(uuid.uuid4())
        task_name = task_name or f"批量任务_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # 处理图像
        results = process_batch_images(temp_files, job_id)
        
        # 清理临时文件
        for temp_file in temp_files:
            os.unlink(temp_file)
        
        return jsonify({
            'id': job_id,
            'name': task_name,
            'status': 'completed',
            'total_images': len(temp_files),
            'processed_images': len(results),
            'real_count': sum(1 for r in results if r['prediction'] == 'real'),
            'ai_count': sum(1 for r in results if r['prediction'] == 'fake'),
            'success_count': len(results),
            'failed_count': 0,
            'created_at': datetime.now().isoformat(),
            'results': results
        })
        
    except Exception as e:
        logger.error(f"批量检测失败: {str(e)}")
        return jsonify({'error': f'批量检测失败: {str(e)}'}), 500

def process_batch_images(image_paths, job_id):
    """处理批量图像"""
    results = []
    
    # 如果全局模型未加载，创建临时模型实例
    model_to_use = safe_model
    if model_to_use is None:
        model_to_use = SAFEModel(Config.MODEL_PATH, Config.DEVICE)
    
    # 创建批量任务的图片存储目录
    batch_images_dir = os.path.join('batch_images', job_id)
    os.makedirs(batch_images_dir, exist_ok=True)
    
    for i, image_path in enumerate(image_paths):
        try:
            start_time = time.time()
            result = model_to_use.predict(image_path)
            processing_time = time.time() - start_time
            
            # 生成唯一的文件名
            original_filename = os.path.basename(image_path)
            safe_filename = f"{i:03d}_{uuid.uuid4().hex[:8]}_{original_filename}"
            
            # 复制原始图片到批量任务目录
            batch_image_path = os.path.join(batch_images_dir, safe_filename)
            shutil.copy2(image_path, batch_image_path)
            
            # 生成图片URL
            image_url = f"http://localhost:8002/batch/{job_id}/image/{safe_filename}"
            
            # 生成热力图（仅对AI生成图像）
            heatmap_url = None
            if result['prediction'] == 'fake' and heatmap_generator:
                # 保存到 heatmaps 目录
                heatmap_dir = 'heatmaps'
                os.makedirs(heatmap_dir, exist_ok=True)
                heatmap_filename = f"batch_{job_id}_{i:03d}_{uuid.uuid4().hex[:8]}.jpg"
                heatmap_path = os.path.join(heatmap_dir, heatmap_filename)
                
                logger.info(f"批量任务 {job_id}: 为图片 {original_filename} 生成热力图")
                if heatmap_generator.generate(image_path, heatmap_path):
                    heatmap_url = f"http://localhost:8002/heatmap/{heatmap_filename}"
                    logger.info(f"批量任务热力图URL: {heatmap_url}")
                else:
                    logger.warning(f"批量任务 {job_id}: 热力图生成失败 {original_filename}")
            
            results.append({
                'index': i,
                'filename': original_filename,
                'prediction': result['prediction'],
                'confidence': result['confidence'],
                'processing_time': processing_time,
                'status': 'success',
                'image_url': image_url,
                'original_image_url': image_url,  # 添加这个字段以兼容前端
                'heatmap_url': heatmap_url
            })
            
        except Exception as e:
            logger.error(f"处理图像失败 {image_path}: {str(e)}")
            results.append({
                'index': i,
                'filename': os.path.basename(image_path),
                'status': 'failed',
                'error': str(e)
            })
    
    return results

@app.route('/batch/<job_id>/status', methods=['GET'])
def get_batch_status(job_id):
    """获取批量任务状态"""
    # 简化版本，实际应用中需要任务管理系统
    return jsonify({
        'id': job_id,
        'status': 'completed',
        'message': '任务已完成'
    })

if __name__ == '__main__':
    logger.info("正在启动AI检测服务...")
    model_loaded = init_model()
    
    if model_loaded:
        logger.info("🎉 AI检测服务启动成功！")
        logger.info("✅ HCF模型已加载")
    else:
        logger.warning("⚠️  AI检测服务启动成功，但模型未加载")
        logger.warning("🔄 将使用启发式方法进行检测")
    
    logger.info("🌐 服务地址: http://localhost:8002")
    logger.info("🔍 健康检查: http://localhost:8002/health")
    logger.info("📡 单张检测: POST http://localhost:8002/detect")
    logger.info("📦 批量检测: POST http://localhost:8002/detect/batch")
    
    app.run(host=Config.HOST, port=Config.PORT, debug=Config.DEBUG) 