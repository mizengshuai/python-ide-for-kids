export interface Example {
  id: string;
  title: string;
  unit: number;
  desc: string;
  challenge: string;
  code: string;
}

export const EXAMPLES: Example[] = [
  {
    id: 'hello',
    title: '你好，世界',
    unit: 1,
    desc: '第一行代码：让电脑说话',
    challenge: '改造：把名字改成你自己的，再加一行输出「我 X 岁了」',
    code: `# 我的第一个 Python 程序
print("你好，世界！")
print("我叫小明")
`,
  },
  {
    id: 'greet',
    title: '和电脑聊天',
    unit: 1,
    desc: '用 input 让电脑问你问题',
    challenge: '改造：再问一个「你最喜欢吃什么」，并把它输出出来',
    code: `name = input("你叫什么名字？")
print("你好，", name, "！欢迎来学 Python！")
`,
  },
  {
    id: 'star',
    title: '画一个五角星',
    unit: 2,
    desc: '小海龟前进 100，右转 144°，重复 5 次',
    challenge: '改造：把它改成六角星（提示：144 换成 160？试试别的角度）',
    code: `import turtle

turtle.shape("turtle")
turtle.pencolor("red")
turtle.pensize(3)

for i in range(5):
    turtle.forward(150)
    turtle.right(144)

turtle.hideturtle()
print("五角星画好了！")
`,
  },
  {
    id: 'square-spiral',
    title: '彩色螺旋方块',
    unit: 3,
    desc: '循环 + 每次多转一点，画出神奇图案',
    challenge: '改造：把 range(100) 改成 range(200)，把 91 改成 60 看看变化',
    code: `import turtle

turtle.speed(0)
colors = ["red", "orange", "green", "blue", "purple"]

for i in range(100):
    turtle.pencolor(colors[i % 5])
    turtle.forward(i)
    turtle.left(91)

turtle.hideturtle()
print("螺旋方块画好了！")
`,
  },
  {
    id: 'dice',
    title: '掷骰子比大小',
    unit: 3,
    desc: '随机数 + if 判断',
    challenge: '改造：改成掷 3 次比总和，或者做成猜数字游戏',
    code: `import random

a = random.randint(1, 6)
b = random.randint(1, 6)
print("我掷出了", a)
print("电脑掷出了", b)

if a > b:
    print("你赢啦！")
elif a < b:
    print("电脑赢了，再来一局？")
else:
    print("平局！")
`,
  },
  {
    id: 'circle-flower',
    title: '画一朵花',
    unit: 4,
    desc: '旋转着画圆，花瓣自己长出来',
    challenge: '改造：把 36 改成 18 或 72，把半径改成 80 试试',
    code: `import turtle

turtle.speed(0)
turtle.pensize(2)

for i in range(36):
    turtle.pencolor("crimson")
    turtle.circle(60)
    turtle.left(10)

turtle.hideturtle()
print("花开啦！")
`,
  },
  {
    id: 'scores',
    title: '成绩统计小助手',
    unit: 4,
    desc: '列表、循环、求和、最大值',
    challenge: '改造：算出平均分，再输出不及格（<60）的有几个人',
    code: `scores = [98, 76, 59, 88, 61, 45, 90]

print("全班成绩：", scores)
print("总分明：", sum(scores))
print("最高分：", max(scores))
print("最低分：", min(scores))
print("人数：", len(scores))

for s in scores:
    if s >= 90:
        print(s, "分，太棒了！")
    elif s < 60:
        print(s, "分，要加油哦")
`,
  },
  {
    id: 'function',
    title: '我的函数：画 N 边形',
    unit: 5,
    desc: '把画图变成一个可以重复用的函数',
    challenge: '改造：加一个 color 参数，让每个形状颜色不同',
    code: `import turtle

def polygon(n, size):
    """画一个 n 边形"""
    angle = 360 / n
    for i in range(n):
        turtle.forward(size)
        turtle.left(angle)

turtle.speed(0)
polygon(3, 80)
polygon(4, 80)
polygon(5, 80)
polygon(6, 80)
turtle.hideturtle()
print("三角形、四边形、五边形、六边形都画好了！")
`,
  },
];
