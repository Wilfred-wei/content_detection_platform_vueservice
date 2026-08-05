from flask import Blueprint, request, jsonify, send_from_directory, abort
from .services import *
from config import Config
import os
from pathlib import Path
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

module3_bp = Blueprint('module3', __name__, url_prefix='/video_analysis/module3')

_model_instance = None

def _validate_video_path(filename):
    """验证视频文件路径安全性"""
    video_dir = Path(Config.MODULE3_VIDEO_FOLDER)
    if not video_dir.exists():
        logger.error(f"视频目录不存在: {video_dir}")
        video_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = video_dir / filename
    try:
        # 防止目录遍历攻击
        if not file_path.resolve().parent.samefile(video_dir.resolve()):
            logger.warning(f"非法路径访问尝试: {filename}")
            return None
        return str(file_path)
    except Exception as e:
        logger.error(f"路径验证失败: {e}")
        return None

@module3_bp.route('/videos/<path:filename>')
def serve_module3_video(filename):
    """
    视频文件服务端点
    前端请求路径: /video_analysis/module3/videos/filename.mp4
    对应文件位置: {MODULE3_VIDEO_FOLDER}/filename.mp4
    """
    try:
        # 验证文件路径
        valid_path = _validate_video_path(filename)
        if not valid_path:
            return jsonify({"error": "Invalid file path"}), 400
        
        # 检查文件是否存在
        if not os.path.exists(valid_path):
            logger.error(f"文件不存在: {valid_path}")
            return jsonify({
                "error": "Video not found",
                "requested_file": filename,
                "storage_path": valid_path
            }), 404
        
        logger.info(f"正在提供视频文件: {filename}")
        return send_from_directory(
            os.path.dirname(valid_path),
            os.path.basename(valid_path),
            as_attachment=False,
            conditional=True
        )
    except Exception as e:
        logger.error(f"视频服务错误: {str(e)}")
        return jsonify({
            "error": "Internal server error",
            "detail": str(e)
        }), 500

def _process_file_paths(records):
    """统一处理文件路径，返回纯文件名"""
    processed = []
    for record in records:
        try:
            new_record = record.copy()
            if 'file_path' in new_record and isinstance(new_record['file_path'], str):
                new_record['file_path'] = os.path.basename(new_record['file_path'])
            processed.append(new_record)
        except Exception as e:
            logger.error(f"记录处理失败: {e}")
            continue
    return processed

@module3_bp.route('/history', methods=['GET'])
def get_history():
    """获取历史记录"""
    try:
        records = load_history_records('module3')
        processed_records = _process_file_paths(records)
        logger.info(f"返回历史记录数: {len(processed_records)}")
        return jsonify(processed_records)
    except Exception as e:
        logger.error(f"获取历史记录失败: {e}")
        return jsonify({
            "error": "Failed to load history",
            "detail": str(e)
        }), 500

@module3_bp.route('/history/<string:record_id>', methods=['GET'])
def get_record(record_id):
    """获取单个记录详情"""
    try:
        records = load_history_records('module3')
        record = next((r for r in records if r['id'] == record_id), None)
        
        if not record:
            logger.warning(f"记录未找到: {record_id}")
            return jsonify({"error": "Record not found"}), 404
        
        if 'file_path' in record:
            record['file_path'] = os.path.basename(record['file_path'])
        
        logger.info(f"返回记录详情: {record_id}")
        return jsonify({
            "status": "success",
            "result": record
        })
    except Exception as e:
        logger.error(f"获取记录详情失败: {e}")
        return jsonify({"error": str(e)}), 500

@module3_bp.route('/history', methods=['DELETE'])
def delete_all_record():
    """删除所有历史记录"""
    try:
        if delete_all('module3'):
            logger.info("已删除所有历史记录")
            return jsonify({"status": "success"})
        logger.error("删除操作失败")
        return jsonify({"error": "Delete operation failed"}), 500
    except Exception as e:
        logger.error(f"删除全部记录失败: {e}")
        return jsonify({"error": str(e)}), 500

@module3_bp.route('/history/<string:record_id>', methods=['DELETE'])
def delete_history_record(record_id):
    """删除指定记录"""
    try:
        if delete_record(record_id, 'module3'):
            logger.info(f"已删除记录: {record_id}")
            return jsonify({"status": "success"})
        logger.warning(f"删除记录未找到: {record_id}")
        return jsonify({"error": "Record not found"}), 404
    except Exception as e:
        logger.error(f"删除记录失败: {e}")
        return jsonify({"error": str(e)}), 500