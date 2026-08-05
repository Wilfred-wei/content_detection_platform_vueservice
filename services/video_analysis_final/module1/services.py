import json
import os
from config import Config

def save_history_record(record, module_name):
    history_file = os.path.join(Config.MODULE1_DATA_FOLDER, f'{module_name}_history.json')
    print(f"尝试保存到: {history_file}")  # 调试输出
    
    os.makedirs(Config.MODULE1_DATA_FOLDER, exist_ok=True)
    records = load_history_records(module_name) or []
    records.append(record)
    
    try:
        with open(history_file, 'w') as f:
            json.dump(records, f, indent=2)
        print("保存成功")  # 调试输出
    except Exception as e:
        print(f"保存失败: {str(e)}")  # 调试输出

def load_history_records(module_name):
    """从JSON文件加载历史记录"""
    history_file = os.path.join(Config.MODULE1_DATA_FOLDER, f'{module_name}_history.json')
    
    if not os.path.exists(history_file):
        return []
    
    try:
        with open(history_file, 'r') as f:
            if os.path.getsize(history_file) == 0:
                return []
            return json.load(f)
    except json.JSONDecodeError:
        return []

def load_history_record(record_id,module_name):
    """从JSON文件加载单个历史记录详情"""
    history_file = os.path.join(Config.MODULE1_DATA_FOLDER, f'{module_name}_history.json')
    
    if not os.path.exists(history_file):
        print("错误: 历史文件不存在")
        return False
    
    try:
        with open(history_file, 'r') as f:
            records = json.load(f) if os.path.getsize(history_file) > 0 else []
            record = [r for r in records if str(r['id']) == str(record_id)]
            return record
    except json.JSONDecodeError:
        print('查询操作异常')
        return False

def delete_record(record_id, module_name):
    history_file = os.path.join(Config.MODULE1_DATA_FOLDER, f'{module_name}_history.json')
    print(f"尝试删除记录ID: {record_id} | 文件: {history_file}")  # 调试输出
    
    if not os.path.exists(history_file):
        print("错误: 历史文件不存在")
        return False

    try:
        with open(history_file, 'r') as f:
            records = json.load(f) if os.path.getsize(history_file) > 0 else []
        
        print(f"删除前记录数: {len(records)}")  # 调试输出
        new_records = [r for r in records if str(r['id']) != str(record_id)]
        
        if len(new_records) != len(records):
            with open(history_file, 'w') as f:
                json.dump(new_records, f, indent=2)
            print(f"删除后记录数: {len(new_records)}")  # 调试输出
            return True
        else:
            print("警告: 未找到匹配的记录ID")
            return False
    except Exception as e:
        print(f"删除操作异常: {str(e)}")  # 调试输出
        return False

def delete_all(module_name):
    history_file = os.path.join(Config.MODULE1_DATA_FOLDER, f'{module_name}_history.json')
    
    if not os.path.exists(history_file):
        print("错误: 历史文件不存在")
        return False

    try:
        with open(history_file, 'r') as f:
            records = json.load(f) if os.path.getsize(history_file) > 0 else []
        
        print(f"删除前记录数: {len(records)}")  # 调试输出
        new_records = []
        
        if len(new_records) != len(records):
            with open(history_file, 'w') as f:
                json.dump(new_records, f, indent=2)
            print(f"删除后记录数: {len(new_records)}")  # 调试输出
            return True
        else:
            print("警告: 删除不成功")
            return False
    except Exception as e:
        print(f"删除操作异常: {str(e)}")  # 调试输出
        return False