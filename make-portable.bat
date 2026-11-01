@echo off
chcp 65001 >nul
title 组装 Python 编程工具 便携发行包
cd /d %~dp0

echo ══════════════════════════════════════
echo   组装绿色便携发行包
echo ══════════════════════════════════════

REM 1) 便携运行时（首次构建时才下载安装）
if not exist sidecar\py-runtime\python.exe (
  echo [1/4] 准备内嵌 Python 运行时（首次约几分钟）...
  if not exist sidecar\py-runtime mkdir sidecar\py-runtime
  powershell -Command "Invoke-WebRequest -Uri 'https://registry.npmmirror.com/-/binary/python/3.12.10/python-3.12.10-embed-amd64.zip' -OutFile 'sidecar\py-embed.zip'"
  powershell -Command "Expand-Archive -Path 'sidecar\py-embed.zip' -DestinationPath 'sidecar\py-runtime' -Force"
  powershell -Command "(Get-Content 'sidecar\py-runtime\python312._pth') -replace '#import site','import site' | Set-Content 'sidecar\py-runtime\python312._pth'"
  powershell -Command "Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile 'sidecar\py-runtime\get-pip.py'"
  sidecar\py-runtime\python.exe sidecar\py-runtime\get-pip.py -q -i https://mirrors.aliyun.com/pypi/simple/
  sidecar\py-runtime\python.exe -m pip install -q jupyter-server ipykernel matplotlib aiohttp -i https://mirrors.aliyun.com/pypi/simple/
  sidecar\py-runtime\python.exe -m ipykernel install --prefix sidecar\py-runtime --name python3
  del sidecar\py-embed.zip
)

echo [2/4] 构建界面...
call npm run build || (echo 界面构建失败 & pause & exit /b 1)

echo [3/4] 构建桌面程序...
where cargo >nul 2>nul || (echo 需要 Rust 工具链 & pause & exit /b 1)
pushd apps\desktop && cargo build --release || (popd & echo 构建失败 & pause & exit /b 1) && popd

echo [4/4] 组装发行目录...
if exist release rmdir /s /q release
mkdir "release\Python编程工具"
copy apps\desktop\target\release\xiaomang-desktop.exe "release\Python编程工具\Python编程工具.exe" >nul
xcopy apps\web\dist "release\Python编程工具\apps\web\dist\" /e /i /q >nul
xcopy sidecar "release\Python编程工具\sidecar\" /e /i /q /exclude:make-portable.exclude >nul

echo.
echo 组装完成：release\Python编程工具\
echo   双击其中的「Python编程工具.exe」即可运行（无需安装 Python）
echo   打 zip 分发：右键该文件夹 → 压缩
pause
