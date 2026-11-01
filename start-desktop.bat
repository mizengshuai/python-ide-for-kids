@echo off
chcp 65001 >nul
title Python编程工具 桌面版（开发构建）
cd /d %~dp0

REM 优先用已构建好的桌面 exe；不存在则提示构建
set EXE=apps\desktop\target\release\xiaomang-desktop.exe
if not exist "%EXE%" (
  echo [提示] 桌面程序还没构建，正在构建（首次约 5-10 分钟）...
  where cargo >nul 2>nul || ( echo [错误] 需要 Rust 工具链 & pause & exit /b 1 )
  pushd apps\desktop && cargo build --release && popd
)
start "" "%EXE%"
