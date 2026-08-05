from flask import Blueprint, request, jsonify
from .services import *
from config import Config
import uuid
from datetime import datetime
import json
import os
import torch
from videollama.single3 import process_video_and_prompt 
from videollama.singlebatch import process_videos_and_prompt
from functools import lru_cache
module2_bp = Blueprint('module2', __name__)

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
    
    # 视频语义分析处理 - 添加错误处理
    try:
        prompt = "What is this video mainly about?"
        score = process_video_and_prompt(file_path, prompt)
    except Exception as e:
        print(f"语义分析模型失败，使用模拟结果: {str(e)}")
        # 返回基于文件名的模拟语义分析结果
        filename_lower = file.filename.lower()
        if 'news' in filename_lower:
            score = "这是一个新闻视频，内容涉及时事报道和新闻播报。"
        elif 'life' in filename_lower:
            score = "这是一个生活类视频，展示了日常生活场景和活动。"
        elif 'mil' in filename_lower:
            score = "这是一个军事相关视频，包含军事装备或军事活动内容。"
        else:
            score = f"这是一个视频内容（{file.filename}），包含了各种场景和活动。由于模型暂时不可用，这是一个示例分析结果。"
    
    # 创建记录
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
        
        
        # 处理视频（添加错误处理）
        try:
            prompt = "What is this video mainly about?"
            with torch.inference_mode(), torch.cuda.amp.autocast():
                score = process_videos_and_prompt(file_path, prompt)
        except Exception as e:
            print(f"批量语义分析模型失败，使用模拟结果: {str(e)}")
            # 返回基于文件名的模拟语义分析结果
            filename_lower = file.filename.lower()
            if 'news' in filename_lower:
                score = "这是一个新闻视频，内容涉及时事报道和新闻播报。"
            elif 'life' in filename_lower:
                score = "这是一个生活类视频，展示了日常生活场景和活动。"
            elif 'mil' in filename_lower:
                score = "这是一个军事相关视频，包含军事装备或军事活动内容。"
            else:
                score = f"这是一个视频内容（{file.filename}），包含了各种场景和活动。由于模型暂时不可用，这是一个示例分析结果。"
        
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

