# -*- coding: utf-8 -*-
"""启动本机 Jupyter Server（仅 127.0.0.1），供前端使用。

in-process 启动：绑定成功后把实际端口写入 xm-connection.json（供 serve.py 读取）。
用法：python start_jupyter.py
"""
import json
import os
import pathlib
import signal
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from xm.watchdog import start_watchdog  # noqa: E402

start_watchdog()

BASE = pathlib.Path(__file__).resolve().parent
PORT = 8899
TOKEN = "xm-local-token"
WORKSPACES = BASE / "workspaces"
WORKSPACES.mkdir(parents=True, exist_ok=True)

# 内核环境：turtle 重定向 + xm 包可见
os.environ["PYTHONPATH"] = str(BASE) + os.pathsep + os.environ.get("PYTHONPATH", "")
os.environ["IPYTHONDIR"] = str(BASE / "ipython_dir")
os.environ["XM_SIDECAR_DIR"] = str(BASE)


def write_conn(port: int):
    (BASE / "xm-connection.json").write_text(
        json.dumps({"port": port, "token": TOKEN}, ensure_ascii=False), encoding="utf-8"
    )


def ensure_kernelspec():
    """便携运行时自适应：把 python3 内核的 argv[0] 改成当前解释器绝对路径。

    （kernelspec 默认写裸名 python，绿色包解压位置不定、不在 PATH，内核会起不来）
    """
    import sysconfig

    candidates = [
        pathlib.Path(sys.prefix) / "share" / "jupyter" / "kernels" / "python3" / "kernel.json",
        BASE / "py-runtime" / "share" / "jupyter" / "kernels" / "python3" / "kernel.json",
    ]
    for kjson in candidates:
        if not kjson.exists():
            continue
        spec = json.loads(kjson.read_text(encoding="utf-8"))
        exe = pathlib.Path(sys.executable).resolve().as_posix()
        if spec.get("argv") and spec["argv"][0] != exe:
            spec["argv"][0] = exe
            kjson.write_text(json.dumps(spec, indent=1), encoding="utf-8")
            print("[Python编程工具] kernelspec 已指向 %s" % exe, flush=True)
        return


def main():
    ensure_kernelspec()
    from jupyter_server.serverapp import ServerApp

    app = ServerApp.instance(
        port=PORT,
        ip="127.0.0.1",
        token=TOKEN,
        password="",
        open_browser=False,
        root_dir=str(WORKSPACES),
        allow_origin="*",
        allow_credentials=False,
        disable_check_xsrf=True,  # 本机单用户，前端同源代理
    )
    app.initialize([])
    write_conn(app.port)  # port_retries 后的的实际端口
    print("[Python编程工具] Jupyter 运行于 http://127.0.0.1:%d  工作区：%s" % (app.port, WORKSPACES), flush=True)
    try:
        app.start()
    except KeyboardInterrupt:
        pass
    finally:
        app.cleanup_no_default()


if __name__ == "__main__":
    main()
