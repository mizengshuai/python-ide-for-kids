# -*- coding: utf-8 -*-
"""IPython kernel 启动钩子：把 turtle 重定向到 xmturtle（前端画布版）"""
import os
import sys

_sidecar_dir = os.environ.get("XM_SIDECAR_DIR", "")
if _sidecar_dir and _sidecar_dir not in sys.path:
    sys.path.insert(0, _sidecar_dir)

try:
    import xm.xmturtle as _xm_turtle
    sys.modules["turtle"] = _xm_turtle
except Exception as _e:  # 加载失败不影响普通 Python 使用
    print("[小蟒] 画布模式加载失败，将使用系统 turtle：%s" % _e)
