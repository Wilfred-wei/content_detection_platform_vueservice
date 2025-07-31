#!/usr/bin/env python3
"""
改进版微服务启动脚本 - 支持Windows和Unix系统
"""
import subprocess
import sys
import time
import os
import threading
import socket
import requests
import platform
from pathlib import Path

# 根据操作系统导入相应模块
if platform.system() != 'Windows':
    import signal

# 服务配置
SERVICES = [
    {
        'name': 'API网关',
        'path': 'gateway',
        'script': 'app.py',
        'port': 28000,
        'env': {'GATEWAY_PORT': '28000'},
        'health_endpoint': '/health'
    },
    {
        'name': '图文谣言检测服务',
        'path': 'services/rumor_detection',
        'script': 'app.py',
        'port': 8010,
        'env': {'RUMOR_SERVICE_PORT': '8010'},
        'health_endpoint': '/health'
    },
    {
        'name': 'AI图像检测服务',
        'path': 'services/ai_detection_service',
        'script': 'app.py',
        'port': 8002,
        'env': {'AI_IMAGE_SERVICE_PORT': '8002'},
        'health_endpoint': '/health'
    },
    {
        'name': '视频分析模块1',
        'path': 'services/video_analysis_module1',
        'script': 'app.py',
        'port': 8003,
        'env': {'VIDEO_MODULE1_PORT': '8003'},
        'health_endpoint': '/health'
    },
    {
        'name': '视频分析模块2',
        'path': 'services/video_analysis_module2',
        'script': 'app.py',
        'port': 8004,
        'env': {'VIDEO_MODULE2_PORT': '8004'},
        'health_endpoint': '/health'
    }

]

# 存储进程对象
processes = []
is_windows = platform.system() == 'Windows'


def check_port_available(port):
    """检查端口是否可用"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(('localhost', port))
            return True
        except OSError:
            return False


def wait_for_service_ready(port, max_wait=30):
    """等待服务启动完成"""
    for i in range(max_wait):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(1)
                result = sock.connect_ex(('localhost', port))
                if result == 0:
                    return True
        except:
            pass
        time.sleep(1)
    return False


def check_service_health(port, endpoint='/health'):
    """检查服务健康状态"""
    try:
        response = requests.get(f'http://localhost:{port}{endpoint}', timeout=5)
        return response.status_code == 200
    except:
        return False


def start_service(service):
    """启动单个服务"""
    service_name = service['name']
    service_port = service['port']
    service_path = service['path']
    
    # 检查端口是否已被占用
    if not check_port_available(service_port):
        print(f"⚠️  端口 {service_port} 已被占用，跳过启动 {service_name}")
        return False
    
    print(f"🚀 启动 {service_name} (端口: {service_port})")
    
    # 设置环境变量
    env = os.environ.copy()
    env.update(service['env'])
    
    # 构建完整路径
    script_path = Path(service_path) / service['script']
    if not script_path.exists():
        print(f"❌ {service_name} 启动失败: 找不到脚本文件 {script_path}")
        return False
    
    # 启动服务
    try:
        # Windows和Unix系统的不同处理
        if is_windows:
            # Windows下使用CREATE_NEW_PROCESS_GROUP
            process = subprocess.Popen(
                [sys.executable, service['script']],
                cwd=service_path,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if is_windows else 0
            )
        else:
            # Unix系统
            process = subprocess.Popen(
                [sys.executable, service['script']],
                cwd=service_path,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                preexec_fn=os.setsid if not is_windows else None
            )
        
        # 等待服务启动
        print(f"  ⏳ 等待 {service_name} 启动...")
        if wait_for_service_ready(service_port, max_wait=10):
            print(f"✅ {service_name} 启动成功 (PID: {process.pid})")
            
            # 检查健康状态
            if check_service_health(service_port, service['health_endpoint']):
                print(f"  💚 {service_name} 健康检查通过")
            else:
                print(f"  ⚠️  {service_name} 健康检查失败，但服务已启动")
            
            processes.append({
                'name': service_name,
                'process': process,
                'port': service_port,
                'service_config': service
            })
            return True
        else:
            print(f"❌ {service_name} 启动超时")
            try:
                # 输出错误信息
                stdout, stderr = process.communicate(timeout=1)
                if stdout:
                    print(f"  输出: {stdout}")
                if stderr:
                    print(f"  错误: {stderr}")
            except:
                pass
            process.terminate()
            return False
            
    except Exception as e:
        print(f"❌ {service_name} 启动失败: {str(e)}")
        return False


def monitor_services():
    """监控服务状态"""
    consecutive_checks = 0
    max_consecutive_checks = 3
    
    while True:
        time.sleep(10)  # 每10秒检查一次
        
        stopped_services = []
        for service in processes:
            if service['process'].poll() is not None:
                stopped_services.append(service['name'])
        
        if stopped_services:
            print(f"\n⚠️  检测到服务停止: {', '.join(stopped_services)}")
            consecutive_checks += 1
            
            if consecutive_checks >= max_consecutive_checks:
                print("🔄 尝试重启停止的服务...")
                restart_stopped_services()
                consecutive_checks = 0
        else:
            consecutive_checks = 0


def restart_stopped_services():
    """重启停止的服务"""
    global processes
    
    # 找出停止的服务
    stopped_services = []
    active_processes = []
    
    for service in processes:
        if service['process'].poll() is not None:
            stopped_services.append(service)
        else:
            active_processes.append(service)
    
    processes = active_processes
    
    # 重启停止的服务
    for service in stopped_services:
        print(f"🔄 重启服务: {service['name']}")
        if start_service(service['service_config']):
            print(f"✅ {service['name']} 重启成功")
        else:
            print(f"❌ {service['name']} 重启失败")


def show_service_status():
    """显示服务状态"""
    print("\n📊 服务状态检查:")
    print("-" * 50)
    
    for service in SERVICES:
        port = service['port']
        name = service['name']
        
        # 检查端口
        port_status = "🟢" if not check_port_available(port) else "🔴"
        
        # 检查健康状态
        health_status = "💚" if check_service_health(port, service['health_endpoint']) else "❤️"
        
        print(f"{port_status} {health_status} {name:20} - http://localhost:{port}")


def terminate_all_services():
    """终止所有服务"""
    print("\n🛑 正在停止所有服务...")
    
    for service in processes:
        try:
            if is_windows:
                # Windows下使用taskkill
                subprocess.run(['taskkill', '/F', '/T', '/PID', str(service['process'].pid)], 
                             capture_output=True)
            else:
                # Unix系统
                os.killpg(os.getpgid(service['process'].pid), signal.SIGTERM)
            
            # 等待进程结束
            try:
                service['process'].wait(timeout=5)
                print(f"✅ {service['name']} 已停止")
            except subprocess.TimeoutExpired:
                if is_windows:
                    subprocess.run(['taskkill', '/F', '/T', '/PID', str(service['process'].pid)], 
                                 capture_output=True)
                else:
                    os.killpg(os.getpgid(service['process'].pid), signal.SIGKILL)
                print(f"🔥 强制终止 {service['name']}")
                
        except Exception as e:
            print(f"❌ 停止 {service['name']} 时出错: {str(e)}")


def main():
    """主函数"""
    print("=" * 60)
    print("🌟 内容检测平台微服务集群启动器 (改进版)")
    print("=" * 60)
    print(f"🖥️  运行环境: {platform.system()} {platform.release()}")
    print(f"🐍 Python版本: {sys.version.split()[0]}")
    
    try:
        # 检查所有服务的脚本文件是否存在
        print("\n🔍 检查服务文件...")
        for service in SERVICES:
            script_path = Path(service['path']) / service['script']
            if script_path.exists():
                print(f"  ✅ {service['name']} - {script_path}")
            else:
                print(f"  ❌ {service['name']} - 找不到 {script_path}")
                return
        
        # 依次启动所有服务
        print("\n🚀 开始启动服务...")
        success_count = 0
        
        for service in SERVICES:
            if start_service(service):
                success_count += 1
            time.sleep(3)  # 服务间启动间隔
        
        print(f"\n" + "=" * 60)
        print(f"🎉 服务启动完成! ({success_count}/{len(SERVICES)} 成功)")
        print("=" * 60)
        
        if success_count > 0:
            print("\n📋 服务列表:")
            for service in SERVICES:
                status = "🟢" if any(p['name'] == service['name'] for p in processes) else "🔴"
                print(f"  {status} {service['name']}: http://localhost:{service['port']}")
            
            print("\n🔗 主要访问地址:")
            print(f"  • API网关: http://localhost:8000")
            print(f"  • 服务状态: http://localhost:8000/services/status")
            print(f"  • 前端界面: http://localhost:3000 (需单独启动)")
            
            # 启动监控线程
            monitor_thread = threading.Thread(target=monitor_services, daemon=True)
            monitor_thread.start()
            
            print("\n⌨️  按 Ctrl+C 停止所有服务")
            print("💡 提示: 每10秒自动检查服务状态，异常服务会自动重启")
            
            # 主循环
            while True:
                try:
                    time.sleep(30)  # 每30秒显示一次状态
                    show_service_status()
                except KeyboardInterrupt:
                    break
        else:
            print("❌ 没有服务成功启动")
            
    except KeyboardInterrupt:
        pass
    finally:
        terminate_all_services()
        print("👋 所有服务已停止")
        sys.exit(0)


if __name__ == '__main__':
    main() 