import json
import sys

# 读取文件路径（已上传）
file1_path = "/sda/home/limingxin/1027_bieshan/video_analysis/temp_data/module3_history.json"
file2_path = "/sda/home/limingxin/1027_bieshan/video_analysis/temp_data/Chinese_video_messages.json"
output_path = "/sda/home/limingxin/1027_bieshan/video_analysis/temp_data/module3_history1.json"


# --- 读取 file1 ---
with open(file1_path, 'r', encoding='utf-8') as f1:
    data1 = json.load(f1)

# --- 读取 file2 ---
try:
    # 尝试正常读取
    with open(file2_path, 'r', encoding='utf-8') as f2:
        data2 = json.load(f2)
except json.JSONDecodeError:
    # 如果报 Extra data 错误，尝试逐行解析
    data2 = []
    with open(file2_path, 'r', encoding='utf-8') as f2:
        for line in f2:
            line = line.strip()
            if not line:
                continue
            try:
                data2.append(json.loads(line))
            except json.JSONDecodeError:
                continue  # 跳过格式错误的行
    print(f"⚠️ file2.json 不是标准数组格式，但已成功按行解析 {len(data2)} 条数据")

# --- 构建映射表 ---
annotation_map = {item["title"]: item["annotation"] for item in data2 if "title" in item and "annotation" in item}

# --- 更新逻辑 ---
for item in data1:
    filename = item.get("filename")
    category = item.get("category")
    annotation = annotation_map.get(filename)

    if annotation is None:
        continue

    if category == "不实信息" and annotation == "真":
        item["category"] = "无"
    elif category == "无" and annotation == "假":
        item["category"] = "不实信息"

# --- 输出结果 ---
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(data1, f, ensure_ascii=False, indent=2)

print(f"✅ 文件已更新并保存到 {output_path}")
