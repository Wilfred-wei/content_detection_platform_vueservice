from flask import Blueprint, request, jsonify, send_from_directory
from .services import *
from pathlib import Path
import logging
from config import Config
import uuid
from datetime import datetime
import json
import os
import torch
from .pro import qwen_video_inference

from functools import lru_cache

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
module2_bp = Blueprint('module2', __name__)
prompt = "请用中文描述视频主要内容，格式参考'本视频主要讲了......'，描述尽量详细，字数不少于30字。如果视频的题目也有有用信息，可以适当结合题目分析。"
# ============== 新增的模型管理部分 ==============
_model_instance = None

@lru_cache(maxsize=1)
def get_video_processor():
    """带缓存的模型获取函数（单例模式）"""
    global _model_instance
    if _model_instance is None:
        print("Initializing video processor...")
        # 这里可以添加模型初始化代码（如果需要）
        _model_instance = True  # 替换为实际的模型初始化
    return _model_instance

def cleanup_resources():
    """清理GPU资源"""
    torch.cuda.empty_cache()
    if torch.cuda.is_available():
        print(f"GPU Memory cleared: {torch.cuda.memory_allocated()/1024**2:.2f}MB freed")

def _validate_video_path(filename):
    # 确保使用MODULE2的文件夹配置
    video_dir = Path(Config.MODULE2_UPLOAD_FOLDER)
    
    if not video_dir.exists():
        logger.info(f"创建视频目录: {video_dir}")
        video_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = video_dir / filename
    
    try:
        # 防止目录遍历攻击
        if not file_path.resolve().parent.samefile(video_dir.resolve()):
            logger.warning(f"非法路径访问尝试: {filename}")
            return None
        
        # 检查文件是否存在
        if not file_path.exists():
            logger.warning(f"文件不存在: {file_path}")
            return None
            
        return str(file_path)
    except Exception as e:
        logger.error(f"路径验证失败: {e}")
        return None

@module2_bp.route('/videos/<path:filename>')
def serve_module1_video(filename):
    """修正后的视频服务端点"""
    try:
        logger.info(f"请求视频文件: {filename}")
        
        # 解码URL编码的文件名
        from urllib.parse import unquote
        filename = unquote(filename)
        
        # 验证文件路径
        valid_path = _validate_video_path(filename)
        if not valid_path:
            logger.error(f"无效文件路径: {filename}")
            return jsonify({"error": "Invalid file path"}), 400
        
        logger.info(f"提供视频文件: {valid_path}")
        return send_from_directory(
            os.path.dirname(valid_path),
            os.path.basename(valid_path),
            as_attachment=False,
            mimetype='video/mp4'
        )
    except Exception as e:
        logger.error(f"视频服务错误: {str(e)}", exc_info=True)
        return jsonify({
            "error": "Internal server error",
            "detail": str(e)
        }), 500

@module2_bp.route('/upload', methods=['POST'])
def upload_video():
    """处理单视频上传"""
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    # 保存文件
    filename = f"{uuid.uuid4().hex}_{file.filename}"
    file_path = os.path.join(Config.MODULE2_UPLOAD_FOLDER, filename)
    file.save(file_path)
    
    # 模拟分析结果

    
    #score = process_video_and_prompt(file_path, prompt)  # 实际项目中这里调用分析函数
    
    score = qwen_video_inference(file_path,prompt)
    record = {
        "id": str(uuid.uuid4()),
        "filename": file.filename,
        "semantic_text": score,
        "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "file_path": file_path
    }
    
    # 保存记录
    save_history_record(record, 'module2')
    return jsonify({
        "status": "success",
        "result": record
    })

@module2_bp.route('/history', methods=['GET'])
def get_history():
    """获取历史记录"""
    records = load_history_records('module2')
    return jsonify(records)

@module2_bp.route('/history', methods=['DELETE'])
def delete_all_record():
    """删除所有历史记录"""
    if delete_all('module2'):
        return jsonify({"status": "success"})
    return jsonify({"error": "Record not found"}), 404

@module2_bp.route('/history/<string:record_id>', methods=['GET'])
def get_record(record_id):
    """获取单个历史记录详情"""
    print(f"请求的记录ID: {record_id}")  # 调试输出
    records = load_history_records('module2')
    record = next((r for r in records if r['id'] == record_id), None)
    
    if not record:
        return jsonify({"error": "Record not found"}), 404
    
    return jsonify({
        "status": "success",
        "result": record  # 直接返回单个对象
    })

@module2_bp.route('/history/<string:record_id>', methods=['DELETE'])
def delete_history_record(record_id):
    """删除历史记录"""
    if delete_record(record_id, 'module2'):
        return jsonify({"status": "success"})
    return jsonify({"error": "Record not found"}), 404

@module2_bp.route('/uploads', methods=['POST'])
def upload_videos():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    try:
        # 保存文件（原有逻辑不变）
        filename = f"{uuid.uuid4().hex}_{file.filename}"
        file_path = os.path.join(Config.MODULE2_UPLOAD_FOLDER, filename)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        file.save(file_path)       
        # 处理视频（原有逻辑不变）        
        with torch.inference_mode(), torch.cuda.amp.autocast():
            score = qwen_video_inference(file_path,prompt)        
        # 创建记录（原有逻辑不变）
        record = {
            "id": str(uuid.uuid4()),
            "filename": file.filename,
            "semantic_text": score,
            "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "file_path": file_path
        }
        
        save_history_record(record, 'module2')
        
        return jsonify({
            "status": "success",
            "result": record
        })
        
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e),
            "message": "Video processing failed"
        }), 500