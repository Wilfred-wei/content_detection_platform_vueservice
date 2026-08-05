#!/usr/bin/env python3
"""
C3N谣言检测服务启动脚本
"""
import os
import sys
import subprocess
import time
import signal
import argparse
from pathlib import Path


def check_dependencies():
    """检查依赖包是否安装"""
    required_packages = [
        'torch', 'torchvision', 'PIL', 'cn_clip', 'transformers',
        'numpy', 'tqdm', 'matplotlib', 'Flask', 'requests'
    ]
    
    missing_packages = []
    for package in required_packages:
        try:
            __import__(package)
        except ImportError:
            missing_packages.append(package)
    
    if missing_packages:
        print(f"缺少依赖包: {missing_packages}")
        print("请运行: pip install -r requirements.txt")
        return False
    
    print("✓ 所有依赖包已安装")
    return True


def check_model_files():
    """检查模型文件是否存在"""
    model_files = [
        'C3N_models.pt',
        'pretrained_models/cn-clip',
    ]
    
    missing_files = []
    for file_path in model_files:
        if not os.path.exists(file_path):
            missing_files.append(file_path)
    
    if missing_files:
        print(f"缺少模型文件: {missing_files}")
        print("注意: 首次运行时会自动下载中文CLIP模型")
        return False
    
    print("✓ 模型文件检查通过")
    return True


def create_directories():
    """创建必要的目录"""
    directories = [
        'uploads',
        'pretrained_models/cn-clip',
        'pretrained_models/clip',
        'logs'
    ]
    
    for directory in directories:
        os.makedirs(directory, exist_ok=True)
    
    print("✓ 目录创建完成")


def start_service(port=5001, debug=True):
    """启动服务"""
    print(f"启动C3N谣言检测服务...")
    print(f"端口: {port}")
    print(f"调试模式: {debug}")
    
    # 设置环境变量
    os.environ['FLASK_ENV'] = 'development' if debug else 'production'
    
    # 启动Flask应用
    try:
        from app import app
        app.run(
            host='0.0.0.0',
            port=port,
            debug=debug,
            use_reloader=False  # 避免重复启动
        )
    except KeyboardInterrupt:
        print("\n服务已停止")
    except Exception as e:
        print(f"启动服务失败: {e}")
        import traceback
        traceback.print_exc()


def run_tests():
    """运行测试"""
    print("运行服务测试...")
    try:
        result = subprocess.run([sys.executable, 'test_service.py'], 
                              capture_output=True, text=True)
        print(result.stdout)
        if result.stderr:
            print("错误输出:", result.stderr)
        return result.returncode == 0
    except Exception as e:
        print(f"运行测试失败: {e}")
        return False


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='C3N谣言检测服务启动脚本')
    parser.add_argument('--port', type=int, default=5001, help='服务端口 (默认: 5001)')
    parser.add_argument('--debug', action='store_true', help='启用调试模式')
    parser.add_argument('--test', action='store_true', help='运行测试后退出')
    parser.add_argument('--check', action='store_true', help='仅检查环境')
    
    args = parser.parse_args()
    
    print("=" * 50)
    print("C3N谣言检测服务启动脚本")
    print("=" * 50)
    
    # 检查当前目录
    current_dir = Path(__file__).parent
    os.chdir(current_dir)
    print(f"工作目录: {os.getcwd()}")
    
    # 环境检查
    print("\n1. 检查环境...")
    if not check_dependencies():
        sys.exit(1)
    
    print("\n2. 创建目录...")
    create_directories()
    
    print("\n3. 检查模型文件...")
    check_model_files()  # 不强制要求，因为会自动下载
    
    if args.check:
        print("\n环境检查完成")
        return
    
    if args.test:
        print("\n4. 运行测试...")
        if run_tests():
            print("✓ 测试通过")
        else:
            print("✗ 测试失败")
            sys.exit(1)
        return
    
    # 启动服务
    print("\n4. 启动服务...")
    print(f"服务地址: http://localhost:{args.port}")
    print(f"健康检查: http://localhost:{args.port}/health")
    print("按 Ctrl+C 停止服务")
    print("-" * 50)
    
    start_service(args.port, args.debug)


if __name__ == "__main__":
    main()
