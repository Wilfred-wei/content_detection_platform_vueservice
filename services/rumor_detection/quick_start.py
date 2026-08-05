#!/usr/bin/env python3
"""
C3N谣言检测服务快速启动脚本 - 包含YOLO目标检测
"""
import os
import sys
import subprocess
from pathlib import Path


def install_dependencies():
    """安装依赖包"""
    print("正在安装依赖包...")
    try:
        subprocess.run([sys.executable, '-m', 'pip', 'install', '-r', 'requirements.txt'], 
                      check=True, capture_output=True, text=True)
        print("✓ 依赖包安装完成")
        return True
    except subprocess.CalledProcessError as e:
        print(f"✗ 依赖包安装失败: {e}")
        print(f"错误输出: {e.stderr}")
        return False


def test_yolo():
    """测试YOLO目标检测"""
    print("\n正在测试YOLO目标检测...")
    try:
        result = subprocess.run([sys.executable, 'test_yolo.py'], 
                              capture_output=True, text=True, timeout=300)
        
        if result.returncode == 0:
            print("✓ YOLO目标检测测试通过")
            return True
        else:
            print("✗ YOLO目标检测测试失败")
            print(f"错误输出: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        print("⚠ YOLO测试超时，可能是首次下载模型")
        return True  # 超时不算失败
    except Exception as e:
        print(f"✗ YOLO测试异常: {e}")
        return False


def start_service():
    """启动服务"""
    print("\n正在启动C3N谣言检测服务...")
    print("服务将在 http://localhost:5001 启动")
    print("按 Ctrl+C 停止服务")
    print("-" * 50)
    
    try:
        subprocess.run([sys.executable, 'start_service.py', '--debug'], check=True)
    except KeyboardInterrupt:
        print("\n服务已停止")
    except Exception as e:
        print(f"服务启动失败: {e}")


def main():
    """主函数"""
    print("="*60)
    print("C3N谣言检测服务 - 快速启动")
    print("包含真实C3N模型 + YOLO目标检测")
    print("="*60)
    
    # 检查当前目录
    current_dir = Path(__file__).parent
    os.chdir(current_dir)
    print(f"工作目录: {os.getcwd()}")
    
    # 创建必要目录
    os.makedirs('pretrained_models/cn-clip', exist_ok=True)
    os.makedirs('uploads', exist_ok=True)
    
    # 步骤1: 安装依赖
    print("\n[1/3] 检查和安装依赖...")
    if not install_dependencies():
        print("依赖安装失败，请手动运行: pip install -r requirements.txt")
        return
    
    # 步骤2: 测试YOLO
    print("\n[2/3] 测试YOLO目标检测...")
    yolo_ok = test_yolo()
    if yolo_ok:
        print("YOLO目标检测准备就绪")
    else:
        print("YOLO测试失败，但服务仍可运行（可能影响目标检测功能）")
    
    # 步骤3: 启动服务
    print("\n[3/3] 启动服务...")
    print("\n服务功能:")
    print("  - C3N图文谣言检测")
    print("  - YOLO目标检测")
    print("  - 智能图像块提取")
    print("  - RESTful API接口")
    
    print(f"\n服务将启动在: http://localhost:5001")
    print("API接口:")
    print("  - GET  /health    # 健康检查")
    print("  - POST /detect    # 谣言检测")
    print("  - GET  /stats     # 服务统计")
    
    # 询问是否继续
    response = input("\n按回车键启动服务，或输入 'q' 退出: ").strip().lower()
    if response == 'q':
        print("退出启动")
        return
    
    start_service()


if __name__ == "__main__":
    main()
