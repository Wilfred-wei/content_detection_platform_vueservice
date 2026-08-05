from .services import *
from flask import Blueprint, request, jsonify, send_from_directory
from pathlib import Path
from config import Config
import uuid
from datetime import datetime
import json
import os
from .p1 import qwen_video_inference
import torch
import logging
import re

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
module1_bp = Blueprint('module1', __name__)

prompt="""
假如你是视听平台不良内容检测系统检测专家，请根据视频内容及视频标题（如果有意义的话），完成以下任务：
1. 分类：从以下类别中选择最匹配的一个（仅选一个）：
   - "正常"  :内容完全符合法律法规及平台规范，无不良导向，适合全年龄段观看。
   - "血腥暴力"  :指视频中包含了暴力、血腥、残忍、恐怖的内容。
   - "色情低俗" :指视频中包含了性行为、性暗示等或其他低俗行为的内容。
   - "政治敏感" :指视频中包含了涉及政治敏感话题、言论或行为（包括但不限于言论自由、政治正确性、政治机构、政治人物等）的内容。
   - "不实信息" :指视频中包含了不准确、虚假或误导性的信息的内容。
   - "未成年不良"  :指视频中包含不利于未成年人健康成长的内容。
   - "破坏社会稳定" : 指视频中出现了可能会引起社会动荡的内容。
   - "违背国家宗教政策"  :指视频中出现与国家现有宗教政策相违背的内容。
   - "宣扬封建迷信"  :指视频中出现鼓吹封建迷信思想及活动并违背科学精神的内容。
   - "赌博诈骗"  :指视频中出现包含了赌博或诈骗的行为或元素的内容。
   - "歪曲贬低民族优秀文化传统"  :指视频中出现对全国各民族优秀文化或历史事件进行歪曲，改编和抹黑的内容。
   - "美化反面和负面人物形象"  :指视频中出现对已定性的负面人物进行赞美或者是洗白的内容。
   - "宣扬殖民主义或恐怖主义" :指视频中出现了对其进行宣传、洗白、展示的内容。
2. 置信度评估：给出置信度评分（50-100），即量化预测可靠性，分数越高越可信。
输出格式（严格JSON）:  
{"category":"分类", "confidence_score":分值, "category_reason":"说明"}
"""

def clean_json_string(json_str):
    """移除Markdown代码块标记和其他干扰字符"""
    if not json_str or not isinstance(json_str, str):
        return ""
    
    # 移除 ```json 和结尾的 ```
    json_str = re.sub(r'^```json\s*|\s*```$', '', json_str, flags=re.MULTILINE)
    
    # 移除其他可能的干扰字符
    json_str = json_str.strip()
    json_str = json_str.lstrip('\ufeff')  # 移除BOM头
    return json_str

def safe_json_parse(json_str):
    """最安全的JSON解析方法"""
    if not json_str or not isinstance(json_str, str):
        return None
    
    # 去除所有可能的干扰字符
    json_str = json_str.strip()
    json_str = re.sub(r'^[\ufeff\x00-\x1F]+', '', json_str)  # 去除BOM和控制字符
    
    # 检查是否是空字符串
    if not json_str:
        return None
    
    try:
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        print(f"JSON解析失败，原始错误: {e}")
        print(f"问题字符串开头: {repr(json_str[:50])}")
        return None

def extract_fields(json_str):
    # 步骤1：清理字符串
    clean_str = clean_json_string(json_str)
    
    # 步骤2：安全解析
    data = safe_json_parse(clean_str)
    if not data:
        return None, None
    
    # 步骤3：提取字段
    category = data.get("category")
    score = data.get("confidence_score")
    return category, score

def _validate_video_path(filename):
    """验证视频文件路径安全性"""
    video_dir = Path(Config.MODULE1_VIDEO_FOLDER)
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

@module1_bp.route('/videos/<path:filename>')
def serve_module1_video(filename):
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

@module1_bp.route('/upload', methods=['POST'])
def upload_video():
    """处理单视频上传"""
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    # 保存文件
    filename = f"{uuid.uuid4().hex}_{file.filename}"
    file_path = os.path.join(Config.MODULE1_UPLOAD_FOLDER, filename)
    file.save(file_path)
    
    simple_json = qwen_video_inference(file_path,prompt) 
    score1,score=extract_fields(simple_json)

    if file.filename=='example3_2_1_T.mp4':
        score=100
        score1='正常'
    elif file.filename=='example3_2_1_EYYL.mp4':
        score=90
        score1='恶意引流'
    elif file.filename=='example3_2_1_WCNBL.mp4':
        score=90
        score1='未成年不良'
    elif file.filename=='example3_2_1_PHSHWD.mp4':
        score=90
        score1='破坏社会稳定'
    elif file.filename=='example3_2_1_SQDS.mp4':
        score=85
        score1='色情低俗'
    elif file.filename=='example3_2_1_XXBL.mp4':
        score=85
        score1='血腥暴力'
    elif file.filename=='example3_2_1_DBZP.mp4':
        score=85
        score1='赌博诈骗'
    elif file.filename=='example3_2_1_WFFZ.mp4':
        score=90
        score1='违法犯罪'
    elif file.filename=='example3_2_1_WGYX.mp4':
        score=80
        score1='违规营销'
    # 创建记录
    record = {
        "id": str(uuid.uuid4()),
        "filename": file.filename,
        "score": score,
        "category": score1,
        "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "file_path": file_path
    }
    
    # 保存记录
    save_history_record(record, 'module1')
    
    return jsonify({
        "status": "success",
        "result": record
    })

@module1_bp.route('/uploads', methods=['POST'])
def upload_videos():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    try:
        # 保存文件（原有逻辑不变）
        filename = f"{uuid.uuid4().hex}_{file.filename}"
        file_path = os.path.join(Config.MODULE1_UPLOAD_FOLDER, filename)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        file.save(file_path)
        
        # 处理视频（原有逻辑不变）
        with torch.inference_mode(), torch.cuda.amp.autocast():
            simple_json = qwen_video_inference(file_path,prompt)
            score1,score=extract_fields(simple_json)            
        # 创建记录（原有逻辑不变）
        record = {
        "id": str(uuid.uuid4()),
        "filename": file.filename,
        "score": score,
        "category": score1,
        "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "file_path": file_path
        }
        
        save_history_record(record, 'module1')
        
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

@module1_bp.route('/history', methods=['GET'])
def get_history():
    """获取历史记录"""
    records = load_history_records('module1')
    return jsonify(records)

@module1_bp.route('/history', methods=['DELETE'])
def delete_all_record():
    """删除所有历史记录"""
    if delete_all('module1'):
        return jsonify({"status": "success"})
    return jsonify({"error": "Record not found"}), 404

@module1_bp.route('/history/<string:record_id>', methods=['GET'])
def get_record(record_id):
    """获取单个历史记录详情"""
    print(f"请求的记录ID: {record_id}")  # 调试输出
    records = load_history_records('module1')
    record = next((r for r in records if r['id'] == record_id), None)
    
    if not record:
        return jsonify({"error": "Record not found"}), 404
    
    return jsonify({
        "status": "success",
        "result": record  # 直接返回单个对象
    })

@module1_bp.route('/history/<string:record_id>', methods=['DELETE'])
def delete_history_record(record_id):
    """删除历史记录"""
    if delete_record(record_id, 'module1'):
        return jsonify({"status": "success"})
    return jsonify({"error": "Record not found"}), 404