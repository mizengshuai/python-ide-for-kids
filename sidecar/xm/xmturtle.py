# -*- coding: utf-8 -*-
"""xmturtle：把 turtle 绘图指令转发到前端画布。

- 几何计算全部在本模块完成（前进/转向/画圆/填充轨迹）
- 每条绘图指令通过 ipykernel Comm（target: xm.turtle）发给前端 canvas 重放
- 覆盖教材常用 API；未覆盖的属性访问会得到友好的中文提示
"""
import math
import sys

try:
    from ipykernel.comm import Comm
except Exception:  # 非 kernel 环境（直接 python 运行）退化为无图模式
    Comm = None

_DEG = math.pi / 180.0

# 颜色名修正：接受中文颜色名，映射为英文（教学友好）
_ZH_COLORS = {
    "红": "red", "绿": "green", "蓝": "blue", "黄": "yellow", "黑": "black",
    "白": "white", "橙": "orange", "紫": "purple", "粉": "pink", "灰": "gray",
    "金": "gold", "棕色": "brown", "红色": "red", "绿色": "green", "蓝色": "blue",
    "黄色": "yellow", "黑色": "black", "白色": "white", "橙色": "orange",
    "紫色": "purple", "粉色": "pink", "灰色": "gray",
}


def _fix_color(c, default):
    if c is None:
        return default
    if isinstance(c, (tuple, list)):
        return "rgb(%s,%s,%s)" % (int(c[0] * 255) if c[0] <= 1 else int(c[0]),
                                  int(c[1] * 255) if c[1] <= 1 else int(c[1]),
                                  int(c[2] * 255) if c[2] <= 1 else int(c[2]))
    if isinstance(c, str):
        return _ZH_COLORS.get(c.strip(), c.strip())
    return default


class _Pen:
    def __init__(self):
        self.down = True
        self.color = "black"
        self.width = 2


class Turtle(object):
    _next_id = 0

    def __init__(self, x=0.0, y=0.0, heading=0.0):
        self._id = "t%d" % Turtle._next_id
        Turtle._next_id += 1
        self._x = float(x)
        self._y = float(y)
        self._heading = float(heading)  # 0=东(右) 逆时针
        self._pen = _Pen()
        self._fill_active = False
        self._fill_color = "black"
        self._fill_points = []
        self._visible = True
        self._shape = "classic"
        self._speed = 6  # 0 最快
        self._comm = None
        self._connect()
        self._send({"op": "cursor", "id": self._id, "x": self._x, "y": self._y,
                    "heading": self._heading, "visible": True, "shape": self._shape})

    # ---------- 通信 ----------
    def _connect(self):
        if Comm is not None:
            try:
                self._comm = Comm(target_name="xm.turtle")
            except Exception:
                self._comm = None

    def _send(self, data):
        if self._comm is not None:
            try:
                self._comm.send(data)
            except Exception:
                pass

    # ---------- 内部 ----------
    def _goto_xy(self, nx, ny, draw=True):
        ox, oy = self._x, self._y
        self._x, self._y = nx, ny
        if self._fill_active:
            self._fill_points.append([nx, ny])
        if draw and self._pen.down:
            self._send({"op": "line", "id": self._id, "x1": ox, "y1": oy,
                        "x2": nx, "y2": ny, "color": self._pen.color, "width": self._pen.width})
        self._send({"op": "cursor", "id": self._id, "x": nx, "y": ny,
                    "heading": self._heading, "visible": self._visible, "shape": self._shape})

    # ---------- 移动 ----------
    def forward(self, distance):
        d = float(distance)
        rad = self._heading * _DEG
        self._goto_xy(self._x + d * math.cos(rad), self._y + d * math.sin(rad))

    fd = forward

    def backward(self, distance):
        d = float(distance)
        rad = self._heading * _DEG
        self._goto_xy(self._x - d * math.cos(rad), self._y - d * math.sin(rad))

    back = bk = backward

    def right(self, angle):
        self._heading = (self._heading - float(angle)) % 360
        self._send({"op": "cursor", "id": self._id, "x": self._x, "y": self._y,
                    "heading": self._heading, "visible": self._visible, "shape": self._shape})

    rt = right

    def left(self, angle):
        self._heading = (self._heading + float(angle)) % 360
        self._send({"op": "cursor", "id": self._id, "x": self._x, "y": self._y,
                    "heading": self._heading, "visible": self._visible, "shape": self._shape})

    lt = left

    def goto(self, x, y=None):
        if y is None:
            x, y = x
        self._goto_xy(float(x), float(y))

    setpos = setposition = goto

    def setx(self, x):
        self._goto_xy(float(x), self._y)

    def sety(self, y):
        self._goto_xy(self._x, float(y))

    def setheading(self, angle):
        self._heading = float(angle) % 360
        self._send({"op": "cursor", "id": self._id, "x": self._x, "y": self._y,
                    "heading": self._heading, "visible": self._visible, "shape": self._shape})

    seth = setheading

    def home(self):
        self._heading = 0.0
        self._goto_xy(0.0, 0.0)

    # ---------- 笔 ----------
    def penup(self):
        self._pen.down = False

    up = pu = penup

    def pendown(self):
        self._pen.down = True

    down = pd = pendown

    def pensize(self, w=None):
        if w is not None:
            self._pen.width = max(1, int(w))
        return self._pen.width

    width = pensize

    def pencolor(self, *args):
        if args:
            self._pen.color = _fix_color(args[0] if len(args) == 1 else args, self._pen.color)
        return self._pen.color

    def fillcolor(self, *args):
        if args:
            self._fill_color = _fix_color(args[0] if len(args) == 1 else args, self._fill_color)
        return self._fill_color

    def color(self, *args):
        if len(args) == 1:
            self.pencolor(args[0])
            self.fillcolor(args[0])
        elif len(args) >= 2:
            self.pencolor(args[0])
            self.fillcolor(args[1])
        return self._pen.color, self._fill_color

    # ---------- 填充 ----------
    def begin_fill(self):
        self._fill_active = True
        self._fill_points = [[self._x, self._y]]

    def end_fill(self):
        self._fill_active = False
        if len(self._fill_points) >= 3:
            self._send({"op": "fill", "id": self._id, "points": self._fill_points,
                        "color": self._fill_color})
        self._fill_points = []

    # ---------- 画圆 ----------
    def circle(self, radius, extent=360.0, steps=None):
        r = float(radius)
        ext = float(extent)
        frac = abs(ext) / 360.0
        n = steps if steps else max(9, int(abs(r) * frac * 1.25))
        w = ext / n
        w2 = 0.5 * (r / r if r else 1) * w * _DEG
        if r < 0:
            w, w2 = -w, -w2
        dl = 2.0 * abs(r) * math.sin(w * _DEG / 2.0) * (1 if ext >= 0 else -1)
        tr = math.radians(self._heading)
        # 起点半径方向垂直于行进方向
        for _ in range(n):
            self._heading = (self._heading + w) % 360
            rad = self._heading * _DEG
            self._goto_xy(self._x + dl * math.cos(rad), self._y + dl * math.sin(rad))

    # ---------- 文字 ----------
    def write(self, text, move=False, align="left", font=None):
        self._send({"op": "text", "id": self._id, "x": self._x, "y": self._y,
                    "text": str(text), "color": self._pen.color, "size": 16})

    # ---------- 状态 ----------
    def speed(self, s=None):
        if s is not None:
            self._speed = max(0, min(10, int(s)))
            self._send({"op": "speed", "value": self._speed})
        return self._speed

    def shape(self, name=None):
        if name:
            self._shape = str(name)
            self._send({"op": "cursor", "id": self._id, "x": self._x, "y": self._y,
                        "heading": self._heading, "visible": self._visible, "shape": self._shape})
        return self._shape

    def hideturtle(self):
        self._visible = False
        self._send({"op": "cursor", "id": self._id, "x": self._x, "y": self._y,
                    "heading": self._heading, "visible": False, "shape": self._shape})

    ht = hideturtle

    def showturtle(self):
        self._visible = True
        self._send({"op": "cursor", "id": self._id, "x": self._x, "y": self._y,
                    "heading": self._heading, "visible": True, "shape": self._shape})

    st = showturtle

    def isdown(self):
        return self._pen.down

    def isvisible(self):
        return self._visible

    def position(self):
        return (self._x, self._y)

    pos = position

    def xcor(self):
        return self._x

    def ycor(self):
        return self._y

    def heading(self):
        return self._heading

    # ---------- 清理 ----------
    def clear(self):
        self._send({"op": "clear", "id": self._id})

    def reset(self):
        self.clear()
        self._x = self._y = 0.0
        self._heading = 0.0
        self._pen = _Pen()
        self._fill_active = False
        self._fill_points = []
        self._send({"op": "cursor", "id": self._id, "x": 0, "y": 0,
                    "heading": 0, "visible": True, "shape": self._shape})

    # ---------- 兼容占位 ----------
    def done(self):
        pass

    mainloop = done

    def stamp(self):
        pass

    def dot(self, size=None, *color):
        r = (size or max(self._pen.width + 4, self._pen.width * 2)) / 2.0
        self._send({"op": "dot", "id": self._id, "x": self._x, "y": self._y,
                    "r": r, "color": _fix_color(color[0] if color else None, self._pen.color)})

    def __getattr__(self, name):
        # 教材里偶见的未实现接口，给中文提示而不是崩溃
        known_alt = {"delay": "本画布不需要 delay", "tracer": "本画布自动刷新，不需要 tracer",
                     "update": "本画布自动刷新，不需要 update", "listen": "暂不支持键盘监听",
                     "onkey": "暂不支持键盘监听", "onclick": "暂不支持鼠标点击",
                     "ontimer": "暂不支持定时器", "getcanvas": "暂不支持获取画布对象",
                     "setundobuffer": "暂不支持撤销", "tilt": "暂不支持倾斜"}
        if name in known_alt:
            def _noop(*a, **k):
                print("[小蟒提示] %s" % known_alt[name])
            return _noop
        raise AttributeError("海龟没有这个功能：%r（可到例程库看看用法）" % name)


# ---------------- Screen 兼容 ----------------
class _Screen:
    def __init__(self):
        self._bgcolor = "white"

    def bgcolor(self, *args):
        if args:
            self._bgcolor = _fix_color(args[0] if len(args) == 1 else args, "white")
        return self._bgcolor

    backgroundcolor = bgcolor

    def setup(self, width=800, height=600, *a, **k):
        if _DEFAULT and _DEFAULT._comm:
            _DEFAULT._send({"op": "init", "w": int(width), "h": int(height)})

    def title(self, *a):
        pass

    def clear(self):
        if _DEFAULT:
            _DEFAULT.clear()

    def resetscreen(self):
        if _DEFAULT:
            _DEFAULT.reset()

    def bye(self):
        pass

    def exitonclick(self):
        pass

    def mainloop(self):
        pass

    done = mainloop


def getscreen():
    return _SCREEN


_ScreenSingleton = None


def Screen():
    return _SCREEN


# ---------------- 模块级默认海龟（turtle.forward(100) 直接可用） ----------------
_DEFAULT = Turtle()
_SCREEN = _Screen()


def _delegate(name):
    def f(*args, **k):
        return getattr(_DEFAULT, name)(*args, **k)
    f.__name__ = name
    return f


for _n in ("forward fd backward back bk right rt left lt goto setpos setposition setx sety "
           "setheading seth home penup up pu pendown down pd pensize width pencolor fillcolor "
           "color begin_fill end_fill circle write speed shape hideturtle ht showturtle st "
           "isdown isvisible position pos xcor ycor heading clear reset stamp dot").split():
    globals()[_n] = _delegate(_n)


def done():
    pass


mainloop = done


def getturtle():
    return _DEFAULT


getpen = getturtle

TurtleScreen = _Screen
ScrolledCanvas = object
Vec2D = None  # type: ignore
