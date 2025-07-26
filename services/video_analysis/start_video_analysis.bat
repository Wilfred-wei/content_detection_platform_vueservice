@echo off
echo 正在启动视频分析服务...
echo.

cd /d "%~dp0"

echo 检查Python环境...
python --version
if errorlevel 1 (
    echo Python未安装或未添加到PATH
    pause
    exit /b 1
)

echo.
echo 安装依赖包...
pip install -r requirements.txt
if errorlevel 1 (
    echo 依赖安装失败
    pause
    exit /b 1
)

echo.
echo 启动视频分析服务...
python start_service.py

pause 