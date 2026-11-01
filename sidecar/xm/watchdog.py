# -*- coding: utf-8 -*-
"""孤儿进程保护：桌面壳（父进程）退出后，自动结束整个 sidecar 进程树。

用法：from xm.watchdog import start_watchdog; start_watchdog()
"""
import os
import subprocess
import threading


def _kill_tree():
    """结束自己及全部子进程（Windows taskkill /T /F）"""
    try:
        subprocess.run(
            ["taskkill", "/PID", str(os.getpid()), "/T", "/F"],
            capture_output=True,
        )
    except Exception:
        pass
    os._exit(0)


def start_watchdog() -> None:
    """监听父进程句柄，父进程退出即自杀（仅 Windows；其他平台静默不启用）"""
    if os.name != "nt":
        return
    try:
        import ctypes

        ppid = os.getppid()
        if not ppid:
            return
        SYNCHRONIZE = 0x00100000
        INFINITE = 0xFFFFFFFF
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.OpenProcess(SYNCHRONIZE, False, ppid)
        if not handle:
            return  # 拿不到句柄（已退出/权限），交给外层清理

        def _watch():
            kernel32.WaitForSingleObject(handle, INFINITE)
            _kill_tree()

        threading.Thread(target=_watch, daemon=True).start()
    except Exception:
        pass
