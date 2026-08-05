import requests
import http.server
import socketserver
import threading
import time
from openai import OpenAI
import os

# 初始化OpenAI客户端
client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url=os.getenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
)

def start_local_server(file_directory, port=8000):
    """启动本地HTTP服务器"""
    os.chdir(file_directory)
    handler = http.server.SimpleHTTPRequestHandler
    httpd = socketserver.TCPServer(("", port), handler)
    
    def serve():
        httpd.serve_forever()
    
    server_thread = threading.Thread(target=serve)
    server_thread.daemon = True
    server_thread.start()
    return httpd, f"http://localhost:{port}"


local_video_path = "/sda/home/limingxin/1027_bieshan/video_analysis/temp_uploads/module3/_8FOvelW67A.mp4"
video_dir = os.path.dirname(local_video_path)
video_filename = os.path.basename(local_video_path)

# 启动本地服务器
httpd, base_url = start_local_server(video_dir)
video_url = f"{base_url}/{video_filename}"
time.sleep(3)

print(f"视频URL: {video_url}")
prompt="""
假如你是视听平台不良内容检测系统检测专家，请根据视频内容及视频标题，完成以下任务：
1. 分类：从以下类别中选择最匹配的一个（仅选一个）：
   - "正常"  :内容完全符合法律法规及平台规范，无不良导向，适合全年龄段观看。
   - "血腥暴力"  :指视频中包含了暴力、血腥、残忍、恐怖的内容。
   - "色情低俗" :指视频中包含了性行为、性暗示等或其他低俗行为的内容。
   - "政治敏感" :指视频中包含了涉及政治敏感话题、言论或行为（包括但不限于言论自由、政治正确性、政治机构、政治人物等）的内容。
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
3.视频的标题是：俄方发射爆破炸弹炸死90名乌克兰军官
"""
reasoning_content = ""  # 定义完整思考过程
answer_content = ""     # 定义完整回复
is_answering = False   # 判断是否结束思考过程并开始回复
enable_thinking = False
# 创建聊天完成请求


completion = client.chat.completions.create(
    model="qwen3-vl-plus",
    
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "video_url",
                        "video_url": {"url": video_url}
                    },
                    {
                        "type": "text",
                        "text": prompt
                    }
                ]
            }
        ],
    stream=True,
    # enable_thinking 参数开启思考过程，thinking_budget 参数设置最大推理过程 Token 数
    extra_body={
        'enable_thinking': True,
        "thinking_budget": 81920},

    # 解除以下注释会在最后一个chunk返回Token使用量
    stream_options={
        "include_usage": True
    })

if enable_thinking:
    print("\n" + "=" * 20 + "思考过程" + "=" * 20 + "\n")

for chunk in completion:
    # 如果chunk.choices为空，则打印usage
    if not chunk.choices:
        print("\nUsage:")
        print(chunk.usage)
    else:
        delta = chunk.choices[0].delta
        # 打印思考过程
        if hasattr(delta, 'reasoning_content') and delta.reasoning_content != None:
            print(delta.reasoning_content, end='', flush=True)
            reasoning_content += delta.reasoning_content
        else:
            # 开始回复
            if delta.content != "" and is_answering is False:
                print("\n" + "=" * 20 + "完整回复" + "=" * 20 + "\n")
                is_answering = True
            # 打印回复过程
            print(delta.content, end='', flush=True)
            answer_content += delta.content

# print("=" * 20 + "完整思考过程" + "=" * 20 + "\n")
# print(reasoning_content)
# print("=" * 20 + "完整回复" + "=" * 20 + "\n")
# print(answer_content)
