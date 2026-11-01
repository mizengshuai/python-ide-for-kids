@echo off
chcp 65001 >nul
title Python 编程工具
cd /d %~dp0

echo ══════════════════════════════════════
echo   🐍 Python 编程工具 启动器
echo ══════════════════════════════════════

where python >nul 2>nul
if errorlevel 1 (
  echo [错误] 没有找到 Python，请先安装 Python 3.10+ 并勾选 Add to PATH
  pause
  exit /b 1
)

if exist sidecar\py-runtime\python.exe goto :run
if not exist sidecar\.venv\Scripts\python.exe (
  echo [首次运行] 正在准备 Python 引擎，需要几分钟，请稍候...
  python -m venv sidecar\.venv
  sidecar\.venv\Scripts\python -m pip install -q -r sidecar\requirements.txt -i https://mirrors.aliyun.com/pypi/simple/
  if errorlevel 1 (
    echo [提示] 阿里镜像安装失败，尝试默认源...
    sidecar\.venv\Scripts\python -m pip install -q -r sidecar\requirements.txt
  )
)

if not exist apps\web\dist\index.html (
  where npm >nul 2>nul
  if errorlevel 1 (
    echo [错误] 界面文件缺失，且本机没有 Node.js，请联系发布者获取完整包
    pause
    exit /b 1
  )
  echo [首次运行] 正在构建界面...
  call npm install --no-audit --no-fund
  call npm run build
)

echo [1/2] 启动 Python 引擎（Jupyter 内核）...
set PYPATH=sidecar\.venv\Scripts\python.exe
if exist sidecar\py-runtime\python.exe set PYPATH=sidecar\py-runtime\python.exe

:run
start "Python引擎" /min %PYPATH% sidecar\start_jupyter.py

echo [2/2] 启动界面，浏览器将自动打开...
timeout /t 3 /nobreak >nul
%PYPATH% sidecar\serve.py

echo.
echo 程序已退出。谢谢使用！
pause
