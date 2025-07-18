@echo off
echo 启动AI检测服务...
echo.
echo 正在检查Python环境...

REM 检查Python是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未找到Python，请先安装Python 3.8+
    pause
    exit /b 1
)

REM 检查并安装依赖
echo 正在检查并安装依赖包...
pip install -r requirements.txt
if errorlevel 1 (
    echo 警告: 某些依赖包安装失败，但服务仍会启动
    echo 如果遇到问题，请手动安装：pip install flask flask-cors torch torchvision pillow opencv-python numpy
)

REM 启动服务
echo.
echo 启动AI检测服务 (端口: 8002)...
echo 访问地址: http://localhost:8002
echo 按 Ctrl+C 停止服务
echo.

python app.py 