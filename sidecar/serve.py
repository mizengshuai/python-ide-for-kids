# -*- coding: utf-8 -*-
"""Python编程工具 生产启动器：静态托管前端构建产物 + 把 /jupyter/* 代理到本机 Jupyter。

单源（同端口）避免任何 CORS 问题；启动后自动打开浏览器。
用法：python serve.py [web_dist_dir] [listen_port]
"""
import asyncio
import os
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from xm.watchdog import start_watchdog  # noqa: E402

start_watchdog()

import aiohttp
from aiohttp import web

BASE = pathlib.Path(__file__).resolve().parent
if len(sys.argv) > 1:
    DIST = (pathlib.Path.cwd() / sys.argv[1]).resolve() if not pathlib.Path(sys.argv[1]).is_absolute() else pathlib.Path(sys.argv[1])
else:
    DIST = BASE.parent / "apps" / "web" / "dist"
LISTEN_PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8710

# Jupyter 真实端口/令牌从 xm-connection.json 读取（start_jupyter.py 写入实际端口）
def _read_conn():
    try:
        d = json.loads((BASE / "xm-connection.json").read_text(encoding="utf-8"))
        return int(d.get("port", 8899)), d.get("token", "xm-local-token")
    except Exception:
        return 8899, "xm-local-token"


JP_PORT, JP_TOKEN = _read_conn()

JP_SUBPROTOCOL = "v1.kernel.websocket.jupyter.org"


def log(*a):
    print(*a, flush=True)


def write_runtime_config():
    cfg = "window.__XM_CONFIG__ = %s;\n" % json.dumps(
        {"baseUrl": "/jupyter/", "token": JP_TOKEN}
    )
    (DIST / "runtime-config.js").write_text(cfg, encoding="utf-8")


async def proxy(request: web.Request):
    global JP_PORT, JP_TOKEN
    JP_PORT, JP_TOKEN = _read_conn()  # 引擎可能晚于本进程就绪：每次请求时刷新实际端口
    path = request.match_info["tail"]
    is_ws = "websocket" in request.headers.get("Upgrade", "").lower()

    if not is_ws:
        url = "http://127.0.0.1:%d/%s" % (JP_PORT, path)
        if request.query_string:
            url += "?" + request.query_string
        headers = {k: v for k, v in request.headers.items()
                   if k.lower() in ("authorization", "content-type", "accept")}
        body = await request.read()
        async with aiohttp.ClientSession(auto_decompress=False) as session:
            async with session.request(request.method, url, headers=headers, data=body,
                                       allow_redirects=False) as resp:
                payload = await resp.read()
                out_headers = {k: v for k, v in resp.headers.items()
                               if k.lower() not in ("transfer-encoding", "content-encoding",
                                                    "content-length", "connection")}
                return web.Response(status=resp.status, body=payload, headers=out_headers)

    # ---- WebSocket（kernel channels）----
    url = "ws://127.0.0.1:%d/%s?token=%s" % (JP_PORT, path, JP_TOKEN)
    if request.query_string:
        url += "&" + request.query_string

    client_protocols = tuple(
        p.strip() for p in request.headers.get("Sec-WebSocket-Protocol", "").split(",") if p.strip()
    )
    ws_down = web.WebSocketResponse(protocols=client_protocols or (JP_SUBPROTOCOL,))
    await ws_down.prepare(request)

    async with aiohttp.ClientSession() as session:
        try:
            ws_up = await session.ws_connect(
                url,
                protocols=client_protocols or (JP_SUBPROTOCOL,),
                max_msg_size=0,
            )
        except Exception as e:
            log("[ws] 上游连接失败", path, repr(e))
            await ws_down.close()
            return ws_down

        async def pump(src, dst, tag):
            try:
                async for msg in src:
                    if msg.type == aiohttp.WSMsgType.TEXT:
                        await dst.send_str(msg.data)
                    elif msg.type == aiohttp.WSMsgType.BINARY:
                        await dst.send_bytes(msg.data)
                    elif msg.type == aiohttp.WSMsgType.CLOSE:
                        await dst.close(code=msg.data or 1000, message=msg.extra or b"")
                        break
            except Exception:
                pass

        await asyncio.gather(
            pump(ws_up, ws_down, "up->down"),
            pump(ws_down, ws_up, "down->up"),
        )
        await session.close()
    return ws_down


async def open_workspace(request: web.Request):
    """在资源管理器中打开学生工作区（桌面化：文件本来就在本机）"""
    import subprocess
    try:
        subprocess.Popen(["explorer", str(BASE / "workspaces")])
        return web.json_response({"ok": True})
    except Exception as e:
        return web.json_response({"ok": False, "err": str(e)}, status=500)


async def index(request: web.Request):
    return web.FileResponse(DIST / "index.html")


def main():
    write_runtime_config()
    app = web.Application()
    app.router.add_get("/", index)
    app.router.add_get("/xm/open-workspace", open_workspace)
    app.router.add_static("/assets", DIST / "assets")
    app.router.add_get("/runtime-config.js", lambda r: web.FileResponse(DIST / "runtime-config.js"))
    app.router.add_route("*", "/jupyter/{tail:.+}", proxy)
    app.router.add_static("/", DIST)  # 根部静态文件（icon.svg / icon-*.png 等）

    candidates = [LISTEN_PORT] + [8799, 8870, 8856, 8858, 8860, 9300, 9200] + [p for p in range(8711, 8741) if p != LISTEN_PORT]

    async def serve_forever():
        runner = web.AppRunner(app)
        await runner.setup()
        bound = None
        for p in candidates:
            try:
                site = web.TCPSite(runner, "127.0.0.1", p)
                await site.start()
                bound = p
                break
            except OSError:
                continue
        if bound is None:
            log("[Python编程工具] 错误：找不到可用端口（%d 起均被占用）" % LISTEN_PORT)
            return
        # 端口写盘，供桌面壳（Tauri）探测
        try:
            (BASE / "xm-ui-port.txt").write_text(str(bound), encoding="utf-8")
        except Exception:
            pass
        log("[Python编程工具] 界面：http://127.0.0.1:%d  （Ctrl+C 退出）  Jupyter端口=%d" % (bound, JP_PORT))
        # 记录启动信息便于诊断
        try:
            (BASE / "xm-serve.log").write_text(
                "port=%d\nopen_browser=%s\n" % (bound, "no" if os.environ.get("XM_DESKTOP") else "yes"),
                encoding="utf-8",
            )
        except Exception:
            pass
        # 桌面壳（XM_DESKTOP=1）自带窗口，不再弹系统浏览器
        if not os.environ.get("XM_DESKTOP"):
            try:
                import webbrowser
                webbrowser.open("http://127.0.0.1:%d" % bound)
            except Exception:
                pass
        await asyncio.Event().wait()  # 常驻

    try:
        asyncio.new_event_loop().run_until_complete(serve_forever())
    except KeyboardInterrupt:
        log("[Python编程工具] 已退出")


if __name__ == "__main__":
    main()
