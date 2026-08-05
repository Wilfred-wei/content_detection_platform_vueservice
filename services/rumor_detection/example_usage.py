"""
C3N谣言检测服务使用示例
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) )

import requests
import json
from PIL import Image
import numpy as np


def example_basic_usage():
    """基本使用示例"""
    print("=== 基本使用示例 ===")
    
    # 创建测试图像
    img_array = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
    img = Image.fromarray(img_array)
    test_image_path = "example_test_image.jpg"
    img.save(test_image_path)
    
    try:
        # 发送检测请求
        with open(test_image_path, 'rb') as f:
            files = {'image': f}
            data = {'content': '这是一条测试文本，用于演示C3N谣言检测功能。'}
            
            response = requests.post('http://localhost:5001/detect', 
                                   files=files, data=data)
        
        if response.status_code == 200:
            result = response.json()
            print("检测成功!")
            print(f"结果: {json.dumps(result, indent=2, ensure_ascii=False)}")
        else:
            print(f"请求失败: {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"请求异常: {e}")
    finally:
        # 清理测试文件
        if os.path.exists(test_image_path):
            os.remove(test_image_path)


def example_with_object_detection():
    """使用目标检测的示例"""
    print("\n=== 目标检测示例 ===")
    
    # 创建一个更有意义的测试图像（带有一些结构）
    img_array = np.random.randint(50, 200, (640, 640, 3), dtype=np.uint8)
    # 添加一些几何形状来模拟可能被检测的目标
    img_array[100:200, 100:200] = [255, 0, 0]  # 红色方块
    img_array[300:400, 300:500] = [0, 255, 0]  # 绿色矩形
    
    img = Image.fromarray(img_array)
    test_image_path = "example_test_image_with_od.jpg"
    img.save(test_image_path)
    
    try:
        print("首先测试YOLO目标检测功能...")
        
        # 直接测试目标检测
        from object_detection_model import get_object_detection_service
        od_service = get_object_detection_service()
        
        if od_service:
            detections = od_service.detection_model.detect_objects(img)
            print(f"检测到 {len(detections)} 个目标:")
            for i, detection in enumerate(detections[:5]):  # 显示前5个
                print(f"  {i+1}. {detection['class_name']} (置信度: {detection['confidence']:.3f})")
            
            # 提取图像块
            patches = od_service.detect_and_extract_patches(img, max_patches=3)
            print(f"提取了 {len(patches)} 个图像块")
        
        # 发送API检测请求
        print("\n现在测试完整的谣言检测API...")
        with open(test_image_path, 'rb') as f:
            files = {'image': f}
            data = {'content': '这是一条包含目标检测的测试文本。图片中可能包含一些物体。'}
            
            response = requests.post('http://localhost:5001/detect', 
                                   files=files, data=data)
        
        if response.status_code == 200:
            result = response.json()
            print("检测成功!")
            print(f"结果: {json.dumps(result, indent=2, ensure_ascii=False)}")
        else:
            print(f"请求失败: {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"请求异常: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # 清理测试文件
        if os.path.exists(test_image_path):
            os.remove(test_image_path)


def example_service_stats():
    """获取服务统计信息示例"""
    print("\n=== 服务统计示例 ===")
    
    try:
        response = requests.get('http://localhost:5001/stats')
        
        if response.status_code == 200:
            stats = response.json()
            print("服务统计信息:")
            print(f"  - 服务名称: {stats['data']['service_name']}")
            print(f"  - 模型版本: {stats['data']['model_version']}")
            print(f"  - 总任务数: {stats['data']['total_tasks']}")
            print(f"  - 完成任务数: {stats['data']['completed_tasks']}")
            print(f"  - 失败任务数: {stats['data']['failed_tasks']}")
            print(f"  - 成功率: {stats['data']['success_rate']:.2f}%")
            print(f"  - 目标检测启用: {stats['data']['object_detection_enabled']}")
        else:
            print(f"获取统计信息失败: {response.status_code}")
            
    except Exception as e:
        print(f"请求异常: {e}")


def example_health_check():
    """健康检查示例"""
    print("\n=== 健康检查示例 ===")
    
    try:
        response = requests.get('http://localhost:5001/health')
        
        if response.status_code == 200:
            health = response.json()
            print("服务健康状态:")
            print(f"  - 状态: {health['data']['status']}")
            print(f"  - 服务名称: {health['data']['service']}")
            print(f"  - 版本: {health['data']['version']}")
        else:
            print(f"健康检查失败: {response.status_code}")
            
    except Exception as e:
        print(f"请求异常: {e}")


def example_direct_service_call():
    """直接调用服务示例"""
    print("\n=== 直接调用服务示例 ===")
    
    try:
        from services import get_rumor_detection_service
        
        # 获取服务实例
        service = get_rumor_detection_service()
        
        # 创建测试图像
        img_array = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
        img = Image.fromarray(img_array)
        test_image_path = "direct_test_image.jpg"
        img.save(test_image_path)
        
        # 直接调用检测方法
        result = service.detect_rumor_sync(
            content="这是一条直接调用的测试文本。",
            image_path=test_image_path
        )
        
        print("直接调用结果:")
        print(f"  - 成功: {result['success']}")
        print(f"  - 是否为谣言: {result['is_rumor']}")
        print(f"  - 置信度: {result['confidence']:.3f}")
        print(f"  - 消息: {result['message']}")
        
        # 清理测试文件
        if os.path.exists(test_image_path):
            os.remove(test_image_path)
            
    except Exception as e:
        print(f"直接调用失败: {e}")
        import traceback
        traceback.print_exc()


def main():
    """主函数"""
    print("C3N谣言检测服务使用示例")
    print("=" * 50)
    
    # 检查服务是否运行
    print("请确保谣言检测服务正在运行 (python app.py)")
    print("服务地址: http://localhost:5001")
    print()
    
    # 运行示例
    examples = [
        ("健康检查", example_health_check),
        ("基本使用", example_basic_usage),
        ("服务统计", example_service_stats),
        ("直接调用", example_direct_service_call),
        ("目标检测", example_with_object_detection),
    ]
    
    for name, func in examples:
        print(f"\n{'='*20} {name} {'='*20}")
        try:
            func()
        except Exception as e:
            print(f"示例执行失败: {e}")
    
    print("\n" + "="*50)
    print("示例执行完成!")
    print("更多信息请参考 README.md")


if __name__ == "__main__":
    main()
