import type { Entry, Placeholder } from './types';

/** 紧凑构造器（tier 由 buildAll 按模块推导，这里产出原始词条） */
type RawEntry = Omit<Entry, 'tier'>;

function e(
  id: string,
  zh: string[],
  pinyin: string[],
  en: string,
  kind: Entry['kind'],
  insert: string,
  placeholders: Placeholder[] | null,
  doc: string,
  example: string,
  module: string,
  unit: number,
  level: 1 | 2 = 1
): RawEntry {
  return { id, zh, pinyin, en, kind, insert, placeholders: placeholders ?? undefined, doc, example, module, unit, level };
}

/** 为带模块前缀的词条生成「. 之后」的方法变体（turtle.forward → forward） */
function methodVariant(entry: RawEntry): RawEntry {
  const prefix = `${entry.module}.`;
  const bare = entry.insert.startsWith(prefix) ? entry.insert.slice(prefix.length) : entry.insert;
  return { ...entry, id: `${entry.id}-m`, kind: 'method', insert: bare };
}

const RAW: RawEntry[] = [
  // ---------- 关键字 ----------
  e('kw-if', ['如果', '假如'], ['ru guo', 'jia ru'], 'if', 'keyword', 'if $1:', [{ n: 1, hint: '条件' }], '如果条件成立，就执行缩进的代码', 'if score > 60:\n    print("及格")', 'syntax', 2),
  e('kw-elif', ['否则如果', '要不然'], ['fou ze ru guo', 'yao bu ran'], 'elif', 'keyword', 'elif $1:', [{ n: 1, hint: '条件' }], '再判断一个条件（跟在 if 后面）', 'if a > b:\n    print("a大")\nelif a < b:\n    print("b大")', 'syntax', 3),
  e('kw-else', ['否则', '不然'], ['fou ze', 'bu ran'], 'else', 'keyword', 'else:', null, '上面条件都不成立时执行', 'else:\n    print("不及格")', 'syntax', 2),
  e('kw-for', ['循环', '对于'], ['xun huan', 'dui yu'], 'for', 'keyword', 'for i in range($1):', [{ n: 1, hint: '重复次数', tip: '身体（缩进的代码）会重复这么多次' }], '把一段代码重复若干次', 'for i in range(5):\n    print(i)', 'syntax', 3),
  e('kw-while', ['当', '只要'], ['dang', 'zhi yao'], 'while', 'keyword', 'while $1:', [{ n: 1, hint: '条件' }], '只要条件成立就一直重复', 'while score < 60:\n    score = score + 1', 'syntax', 4),
  e('kw-def', ['定义函数', '定义'], ['ding yi han shu', 'ding yi'], 'def', 'keyword', 'def $1():', [{ n: 1, hint: '函数名' }], '定义一个自己的函数', 'def say_hi():\n    print("你好")', 'syntax', 5),
  e('kw-return', ['返回'], ['fan hui'], 'return', 'keyword', 'return $1', [{ n: 1, hint: '返回的值' }], '把结果送回给调用处', 'return a + b', 'syntax', 5),
  e('kw-import', ['导入', '引入'], ['dao ru', 'yin ru'], 'import', 'keyword', 'import $1', [{ n: 1, hint: '模块名' }], '引入别人的工具箱（模块）', 'import random', 'syntax', 2),
  e('kw-from', ['从'], ['cong'], 'from', 'keyword', 'from $1 import $2', [{ n: 1, hint: '模块名' }, { n: 2, hint: '名字' }], '从模块里只拿一部分工具', 'from time import sleep', 'syntax', 99),
  e('kw-as', ['作为'], ['zuo wei'], 'as', 'keyword', 'as $1', [{ n: 1, hint: '新名字' }], '给导入的东西起个短名字', 'import numpy as np', 'syntax', 99),
  e('kw-break', ['跳出', '终止循环'], ['tiao chu', 'zhong zhi xun huan'], 'break', 'keyword', 'break', null, '立刻跳出整个循环', 'while True:\n    if ok:\n        break', 'syntax', 4),
  e('kw-continue', ['继续'], ['ji xu'], 'continue', 'keyword', 'continue', null, '跳过这一次，继续下一次循环', 'for i in range(10):\n    if i == 3:\n        continue', 'syntax', 4),
  e('kw-pass', ['占位'], ['zhan wei'], 'pass', 'keyword', 'pass', null, '什么都不做，占个位子', 'def todo():\n    pass', 'syntax', 99),
  e('kw-true', ['真'], ['zhen'], 'True', 'keyword', 'True', null, '布尔值：对/成立', 'flag = True', 'syntax', 2),
  e('kw-false', ['假'], ['jia'], 'False', 'keyword', 'False', null, '布尔值：错/不成立', 'flag = False', 'syntax', 2),
  e('kw-none', ['空'], ['kong'], 'None', 'keyword', 'None', null, '表示「什么都没有」', 'result = None', 'syntax', 3),
  e('kw-not', ['不是', '非'], ['bu shi', 'fei'], 'not', 'keyword', 'not $1', [{ n: 1, hint: '条件' }], '把条件反过来', 'if not ready:', 'syntax', 2),
  e('kw-and', ['并且', '和'], ['bing qie', 'he'], 'and', 'keyword', '$1 and $2', [{ n: 1, hint: '条件1' }, { n: 2, hint: '条件2' }], '两个条件都要成立', 'if age > 6 and age < 12:', 'syntax', 3),
  e('kw-or', ['或者'], ['huo zhe'], 'or', 'keyword', '$1 or $2', [{ n: 1, hint: '条件1' }, { n: 2, hint: '条件2' }], '两个条件有一个成立就行', 'if day == 6 or day == 7:', 'syntax', 3),
  e('kw-in', ['在'], ['zai'], 'in', 'keyword', 'in $1', [{ n: 1, hint: '范围或列表' }], '判断在不在里面 / 用于循环', 'if "a" in name:', 'syntax', 3),
  e('kw-try', ['尝试'], ['chang shi'], 'try', 'keyword', 'try:', null, '试着运行，出错也不崩溃', 'try:\n    n = int(s)\nexcept:\n    n = 0', 'syntax', 99),
  e('kw-except', ['出错时'], ['chu cuo shi'], 'except', 'keyword', 'except:', null, '出错时执行这里', 'except:\n    print("出错了")', 'syntax', 99),
  e('kw-with', ['用'], ['yong'], 'with', 'keyword', 'with $1:', [{ n: 1, hint: '资源' }], '用完自动收拾（如自动关文件）', 'with open("a.txt") as f:\n    print(f.read())', 'syntax', 99),
  e('kw-is', ['是'], ['shi'], 'is', 'keyword', 'is', null, '判断是不是同一个东西', 'if x is None:', 'syntax', 99),
  e('kw-del', ['删除'], ['shan chu'], 'del', 'keyword', 'del $1', [{ n: 1, hint: '变量名' }], '删除一个变量或元素', 'del names[0]', 'syntax', 99),

  // ---------- 内置函数 ----------
  e('bi-print', ['输出', '打印'], ['shu chu', 'da yin'], 'print', 'function', 'print($1)', [{ n: 1, hint: '要显示的内容' }], '把内容显示到屏幕上', 'print("你好，世界")', 'builtin', 1),
  e('bi-input', ['输入'], ['shu ru'], 'input', 'function', 'input($1)', [{ n: 1, hint: '提示语', tip: '先显示这个问题，再等你输入' }], '让用户用键盘输入一句话', 'name = input("你叫什么名字？")', 'builtin', 1),
  e('bi-len', ['长度', '个数'], ['chang du', 'ge shu'], 'len', 'function', 'len($1)', [{ n: 1, hint: '字符串或列表', tip: '能数文字的字符数，也能数列表里有几个' }], '数一数有多少个', 'print(len("hello"))  # 5', 'builtin', 2),
  e('bi-range', ['整数序列', '范围'], ['zheng shu xu lie', 'fan wei'], 'range', 'function', 'range($1)', [{ n: 1, hint: '结束数字（不包含）', tip: '数到它前一个为止：range(5) 是 0 1 2 3 4' }], '生成一串连续整数，常配合 for', 'for i in range(5):  # 0 1 2 3 4', 'builtin', 3),
  e('bi-int', ['整数', '转整数'], ['zheng shu', 'zhuan zheng shu'], 'int', 'function', 'int($1)', [{ n: 1, hint: '要转换的内容' }], '变成整数（文字数字 → 数字）', 'age = int("12")', 'builtin', 2),
  e('bi-float', ['小数', '转小数'], ['xiao shu', 'zhuan xiao shu'], 'float', 'function', 'float($1)', [{ n: 1, hint: '要转换的内容' }], '变成小数', 'price = float("9.9")', 'builtin', 2),
  e('bi-str', ['转字符串'], ['zhuan zi fu chuan'], 'str', 'function', 'str($1)', [{ n: 1, hint: '要转换的内容' }], '变成文字（字符串）', 'str(100)  # "100"', 'builtin', 2),
  e('bi-bool', ['转布尔'], ['zhuan bu er'], 'bool', 'function', 'bool($1)', [{ n: 1, hint: '要转换的内容' }], '变成 True/False', 'bool(0)  # False', 'builtin', 99),
  e('bi-list', ['列表', '转列表'], ['lie biao', 'zhuan lie biao'], 'list', 'function', 'list($1)', [{ n: 1, hint: '可迭代对象' }], '变成列表', 'list("abc")  # ["a","b","c"]', 'builtin', 3),
  e('bi-dict', ['字典', '转字典'], ['zi dian', 'zhuan zi dian'], 'dict', 'function', 'dict()', null, '字典：用「键」找「值」', 'd = {"姓名": "小明", "年龄": 10}', 'builtin', 5),
  e('bi-sum', ['求和', '总和'], ['qiu he', 'zong he'], 'sum', 'function', 'sum($1)', [{ n: 1, hint: '数字列表' }], '把一列数字加起来', 'sum([1, 2, 3])  # 6', 'builtin', 4),
  e('bi-max', ['最大值', '最大'], ['zui da zhi', 'zui da'], 'max', 'function', 'max($1)', [{ n: 1, hint: '列表' }], '找最大的', 'max([3, 9, 4])  # 9', 'builtin', 4),
  e('bi-min', ['最小值', '最小'], ['zui xiao zhi', 'zui xiao'], 'min', 'function', 'min($1)', [{ n: 1, hint: '列表' }], '找最小的', 'min([3, 9, 4])  # 3', 'builtin', 4),
  e('bi-abs', ['绝对值'], ['jue dui zhi'], 'abs', 'function', 'abs($1)', [{ n: 1, hint: '数字' }], '去掉负号', 'abs(-5)  # 5', 'builtin', 4),
  e('bi-round', ['四舍五入'], ['si she wu ru'], 'round', 'function', 'round($1)', [{ n: 1, hint: '小数' }], '四舍五入取整', 'round(3.7)  # 4', 'builtin', 4),
  e('bi-sorted', ['排序'], ['pai xu'], 'sorted', 'function', 'sorted($1)', [{ n: 1, hint: '列表' }], '排好顺序返回新列表', 'sorted([3, 1, 2])  # [1,2,3]', 'builtin', 4),
  e('bi-enumerate', ['编号遍历', '带编号'], ['bian hao bian li', 'dai bian hao'], 'enumerate', 'function', 'enumerate($1)', [{ n: 1, hint: '列表' }], '遍历时同时拿到编号', 'for i, x in enumerate(names):', 'builtin', 99),
  e('bi-zip', ['配对'], ['pei dui'], 'zip', 'function', 'zip($1, $2)', [{ n: 1, hint: '列表1' }, { n: 2, hint: '列表2' }], '把两个列表一一配对', 'for a, b in zip(xs, ys):', 'builtin', 99),
  e('bi-type', ['类型'], ['lei xing'], 'type', 'function', 'type($1)', [{ n: 1, hint: '任何东西' }], '看看它是什么类型', 'type(3)  # int', 'builtin', 3),
  e('bi-open', ['打开文件'], ['da kai wen jian'], 'open', 'function', 'open($1)', [{ n: 1, hint: '文件名', tip: '文件要和程序放在同一个文件夹' }], '打开一个文件', 'f = open("故事.txt", "r", encoding="utf-8")', 'file', 6),
  e('bi-format', ['格式化'], ['ge shi hua'], 'format', 'function', '"{}".format($1)', [{ n: 1, hint: '填进去的值' }], '把值填进文字模板', '"我{}岁".format(10)', 'builtin', 99),

  // ---------- 字符串方法（. 之后使用） ----------
  e('sm-upper', ['转大写', '大写'], ['zhuan da xie', 'da xie'], 'upper', 'method', 'upper()', null, '全部变成大写字母', '"abc".upper()  # ABC', 'str', 3),
  e('sm-lower', ['转小写', '小写'], ['zhuan xiao xie', 'xiao xie'], 'lower', 'method', 'lower()', null, '全部变成小写字母', '"ABC".lower()  # abc', 'str', 3),
  e('sm-strip', ['去两端空白', '去空白'], ['qu liang duan kong bai', 'qu kong bai'], 'strip', 'method', 'strip()', null, '去掉头尾的空格', '"  hi  ".strip()  # hi', 'str', 4),
  e('sm-split', ['分割', '切开'], ['fen ge', 'qie kai'], 'split', 'method', 'split($1)', [{ n: 1, hint: '分隔符' }], '按分隔符切开成列表', '"a,b,c".split(",")', 'str', 4),
  e('sm-join', ['连接'], ['lian jie'], 'join', 'method', 'join($1)', [{ n: 1, hint: '列表' }], '用某符号把列表连成一句话', '"-".join(["a","b"])  # a-b', 'str', 99),
  e('sm-replace', ['替换'], ['ti huan'], 'replace', 'method', 'replace($1, $2)', [{ n: 1, hint: '原来的' }, { n: 2, hint: '新的' }], '把一段文字换成另一段', '"猫狗".replace("狗", "鸡")', 'str', 4),
  e('sm-find', ['查找', '找位置'], ['cha zhao', 'zhao wei zhi'], 'find', 'method', 'find($1)', [{ n: 1, hint: '要找的内容' }], '找到返回位置，找不到返回 -1', '"hello".find("l")  # 2', 'str', 4),
  e('sm-count', ['计数', '数量'], ['ji shu', 'shu liang'], 'count', 'method', 'count($1)', [{ n: 1, hint: '要数的内容' }], '数出现了几次', '"banana".count("a")  # 3', 'str', 4),
  e('sm-startswith', ['开头是'], ['kai tou shi'], 'startswith', 'method', 'startswith($1)', [{ n: 1, hint: '开头内容' }], '判断是不是以…开头', 'name.startswith("小")', 'str', 99),
  e('sm-endswith', ['结尾是'], ['jie wei shi'], 'endswith', 'method', 'endswith($1)', [{ n: 1, hint: '结尾内容' }], '判断是不是以…结尾', 'file.endswith(".txt")', 'str', 99),
  e('sm-isdigit', ['是数字吗'], ['shi shu zi ma'], 'isdigit', 'method', 'isdigit()', null, '判断是不是全是数字', '"123".isdigit()  # True', 'str', 4),

  // ---------- 列表方法 ----------
  e('lm-append', ['添加', '追加'], ['tian jia', 'zhui jia'], 'append', 'method', 'append($1)', [{ n: 1, hint: '要加的内容' }], '在列表最后加一个', 'names.append("小红")', 'list', 3),
  e('lm-pop', ['取出', '弹出'], ['qu chu', 'tan chu'], 'pop', 'method', 'pop($1)', [{ n: 1, hint: '位置（可空）' }], '取出并删掉一个（默认最后一个）', 'last = names.pop()', 'list', 4),
  e('lm-insert', ['插入'], ['cha ru'], 'insert', 'method', 'insert($1, $2)', [{ n: 1, hint: '位置' }, { n: 2, hint: '内容' }], '插到指定位置', 'names.insert(0, "第一名")', 'list', 99),
  e('lm-remove', ['移除'], ['yi chu'], 'remove', 'method', 'remove($1)', [{ n: 1, hint: '要删的值' }], '按内容删掉第一个', 'names.remove("小明")', 'list', 4),
  e('lm-sort', ['排序'], ['pai xu'], 'sort', 'method', 'sort()', null, '原地排序（不返回新列表）', 'scores.sort()', 'list', 4),
  e('lm-reverse', ['倒序'], ['dao xu'], 'reverse', 'method', 'reverse()', null, '把顺序反过来', 'names.reverse()', 'list', 4),
  e('lm-clear', ['清空'], ['qing kong'], 'clear', 'method', 'clear()', null, '清空列表', 'names.clear()', 'list', 99),

  // ---------- 字典方法 ----------
  e('dm-keys', ['所有键'], ['suo you jian'], 'keys', 'method', 'keys()', null, '字典里所有的键', 'for k in d.keys():', 'dict', 5),
  e('dm-values', ['所有值'], ['suo you zhi'], 'values', 'method', 'values()', null, '字典里所有的值', 'for v in d.values():', 'dict', 5),
  e('dm-items', ['键值对'], ['jian zhi dui'], 'items', 'method', 'items()', null, '同时拿到键和值', 'for k, v in d.items():', 'dict', 5),
  e('dm-get', ['取值'], ['qu zhi'], 'get', 'method', 'get($1)', [{ n: 1, hint: '键名' }], '按键取值，不存在也不报错', 'd.get("姓名", "不知道")', 'dict', 5),

  // ---------- turtle（海龟画图） ----------
  e('tu-forward', ['前进', '前'], ['qian jin', 'qian'], 'forward', 'function', 'turtle.forward($1)', [{ n: 1, hint: '距离', tip: '走多少像素' }], '向前走一段', 'turtle.forward(100)', 'turtle', 1),
  e('tu-backward', ['后退', '退'], ['hou tui', 'tui'], 'backward', 'function', 'turtle.backward($1)', [{ n: 1, hint: '距离', tip: '退多少像素' }], '向后退一段', 'turtle.backward(50)', 'turtle', 1),
  e('tu-left', ['左转'], ['zuo zhuan'], 'left', 'function', 'turtle.left($1)', [{ n: 1, hint: '角度', tip: '转多少度（逆时针）' }], '向左转一个角度', 'turtle.left(90)', 'turtle', 1),
  e('tu-right', ['右转'], ['you zhuan'], 'right', 'function', 'turtle.right($1)', [{ n: 1, hint: '角度', tip: '转多少度（顺时针）' }], '向右转一个角度', 'turtle.right(90)', 'turtle', 1),
  e('tu-goto', ['去到'], ['qu dao'], 'goto', 'function', 'turtle.goto($1, $2)', [{ n: 1, hint: 'x', tip: '横向位置，右边是正数' }, { n: 2, hint: 'y', tip: '纵向位置，上面是正数' }], '直接移动到某个坐标', 'turtle.goto(100, 100)', 'turtle', 3),
  e('tu-penup', ['抬笔', '提笔'], ['tai bi', 'ti bi'], 'penup', 'function', 'turtle.penup()', null, '抬起笔，移动时不画线', 'turtle.penup()', 'turtle', 2),
  e('tu-pendown', ['落笔', '放笔'], ['luo bi', 'fang bi'], 'pendown', 'function', 'turtle.pendown()', null, '放下笔，恢复画线', 'turtle.pendown()', 'turtle', 2),
  e('tu-pensize', ['笔的粗细', '笔粗'], ['bi de cu xi', 'bi cu'], 'pensize', 'function', 'turtle.pensize($1)', [{ n: 1, hint: '粗细(1~10)' }], '设置笔的粗细', 'turtle.pensize(3)', 'turtle', 2),
  e('tu-pencolor', ['画笔颜色', '笔颜色'], ['hua bi yan se', 'bi yan se'], 'pencolor', 'function', 'turtle.pencolor("$1")', [{ n: 1, hint: '颜色英文如 red' }], '设置画笔颜色', 'turtle.pencolor("red")', 'turtle', 2),
  e('tu-fillcolor', ['填充颜色'], ['tian chong yan se'], 'fillcolor', 'function', 'turtle.fillcolor("$1")', [{ n: 1, hint: '颜色英文如 yellow' }], '设置填充颜色', 'turtle.fillcolor("yellow")', 'turtle', 4),
  e('tu-begin-fill', ['开始填充'], ['kai shi tian chong'], 'begin_fill', 'function', 'turtle.begin_fill()', null, '开始记录要填充的图形', 'turtle.begin_fill()', 'turtle', 4),
  e('tu-end-fill', ['结束填充'], ['jie shu tian chong'], 'end_fill', 'function', 'turtle.end_fill()', null, '结束并填色', 'turtle.end_fill()', 'turtle', 4),
  e('tu-speed', ['速度'], ['su du'], 'speed', 'function', 'turtle.speed($1)', [{ n: 1, hint: '0~10（0最快）' }], '设置画图速度', 'turtle.speed(3)', 'turtle', 1),
  e('tu-shape', ['形状'], ['xing zhuang'], 'shape', 'function', 'turtle.shape("turtle")', null, '把箭头变成小海龟', 'turtle.shape("turtle")', 'turtle', 1),
  e('tu-circle', ['画圆'], ['hua yuan'], 'circle', 'function', 'turtle.circle($1)', [{ n: 1, hint: '半径', tip: '正数往左弯画圆' }], '画一个圆', 'turtle.circle(50)', 'turtle', 3),
  e('tu-write', ['写字'], ['xie zi'], 'write', 'function', 'turtle.write("$1")', [{ n: 1, hint: '要写的字' }], '在画布上写字', 'turtle.write("你好")', 'turtle', 3),
  e('tu-home', ['回家'], ['hui jia'], 'home', 'function', 'turtle.home()', null, '回到起点，朝向右', 'turtle.home()', 'turtle', 3),
  e('tu-clear', ['清屏'], ['qing ping'], 'clear', 'function', 'turtle.clear()', null, '清掉画的内容（海龟不动）', 'turtle.clear()', 'turtle', 3),
  e('tu-reset', ['重置'], ['chong zhi'], 'reset', 'function', 'turtle.reset()', null, '全部重来（清屏+回家）', 'turtle.reset()', 'turtle', 3),
  e('tu-hideturtle', ['隐藏海龟', '藏海龟'], ['yin cang hai gui', 'cang hai gui'], 'hideturtle', 'function', 'turtle.hideturtle()', null, '把海龟藏起来', 'turtle.hideturtle()', 'turtle', 3),
  e('tu-showturtle', ['显示海龟'], ['xian shi hai gui'], 'showturtle', 'function', 'turtle.showturtle()', null, '把海龟显示出来', 'turtle.showturtle()', 'turtle', 3),
  e('tu-setheading', ['朝向'], ['chao xiang'], 'setheading', 'function', 'turtle.setheading($1)', [{ n: 1, hint: '角度(0右90上)' }], '设定朝向（0右 90上 180左 270下）', 'turtle.setheading(90)', 'turtle', 4),
  e('tu-turtle-class', ['创建海龟', '海龟'], ['chuang jian hai gui', 'hai gui'], 'Turtle', 'class', 'turtle.Turtle()', null, '创建一只海龟（赋值给变量用）', 't = turtle.Turtle()', 'turtle', 2),
  e('tu-done', ['完成'], ['wan cheng'], 'done', 'function', 'turtle.done()', null, '画完了（保持窗口）', 'turtle.done()', 'turtle', 99),

  // ---------- random（随机） ----------
  e('rd-randint', ['随机整数'], ['sui ji zheng shu'], 'randint', 'function', 'random.randint($1, $2)', [{ n: 1, hint: '最小值', tip: '能抽到的最小数（包含它）' }, { n: 2, hint: '最大值', tip: '也能抽到（两边都算）' }], '随机抽一个整数（两边都算）', 'random.randint(1, 6)  # 掷骰子', 'random', 2),
  e('rd-random', ['随机小数'], ['sui ji xiao shu'], 'random', 'function', 'random.random()', null, '0 到 1 之间的随机小数', 'random.random()', 'random', 4),
  e('rd-choice', ['随机选一个', '随机选'], ['sui ji xuan yi ge', 'sui ji xuan'], 'choice', 'function', 'random.choice($1)', [{ n: 1, hint: '列表', tip: '从这个列表里挑一个' }], '从列表里随机挑一个', 'random.choice(["石头", "剪刀", "布"])', 'random', 3),
  e('rd-shuffle', ['打乱'], ['da luan'], 'shuffle', 'function', 'random.shuffle($1)', [{ n: 1, hint: '列表' }], '把列表顺序打乱', 'random.shuffle(cards)', 'random', 99),
  e('rd-uniform', ['范围随机小数'], ['fan wei sui ji xiao shu'], 'uniform', 'function', 'random.uniform($1, $2)', [{ n: 1, hint: '最小值' }, { n: 2, hint: '最大值' }], '范围内的随机小数', 'random.uniform(1.5, 3.5)', 'random', 99),

  // ---------- time（时间） ----------
  e('tm-sleep', ['等待', '暂停'], ['deng dai', 'zan ting'], 'sleep', 'function', 'time.sleep($1)', [{ n: 1, hint: '秒数', tip: '可以写小数，比如 0.5 秒' }], '让程序停一会儿', 'time.sleep(1)', 'time', 2),
  e('tm-time', ['当前时间戳'], ['dang qian shi jian chuo'], 'time', 'function', 'time.time()', null, '当前时间（一个大数字）', 'time.time()', 'time', 99),
  e('tm-strftime', ['格式化时间'], ['ge shi hua shi jian'], 'strftime', 'function', 'time.strftime("%H:%M:%S")', null, '按格式显示当前时间', 'time.strftime("%Y年%m月%d日")', 'time', 99),

  // ---------- math（数学） ----------
  e('ma-sqrt', ['平方根', '开方'], ['ping fang gen', 'kai fang'], 'sqrt', 'function', 'math.sqrt($1)', [{ n: 1, hint: '数字' }], '开平方', 'math.sqrt(9)  # 3.0', 'math', 4),
  e('ma-pi', ['圆周率'], ['yuan zhou lv'], 'pi', 'function', 'math.pi', null, '圆周率 π ≈ 3.14159', 'r = 5; print(2 * math.pi * r)', 'math', 4),
  e('ma-floor', ['向下取整'], ['xiang xia qu zheng'], 'floor', 'function', 'math.floor($1)', [{ n: 1, hint: '小数' }], '往下取整', 'math.floor(3.9)  # 3', 'math', 4),
  e('ma-ceil', ['向上取整'], ['xiang shang qu zheng'], 'ceil', 'function', 'math.ceil($1)', [{ n: 1, hint: '小数' }], '往上取整', 'math.ceil(3.1)  # 4', 'math', 4),
  e('ma-pow', ['乘方'], ['cheng fang'], 'pow', 'function', 'math.pow($1, $2)', [{ n: 1, hint: '底数' }, { n: 2, hint: '指数' }], '几次方', 'math.pow(2, 10)', 'math', 99),

  // ---------- 文件方法（f. 之后） ----------
  e('fm-read', ['读全部'], ['du quan bu'], 'read', 'method', 'read()', null, '读出整个文件内容', 'text = f.read()', 'file', 6),
  e('fm-readline', ['读一行'], ['du yi hang'], 'readline', 'method', 'readline()', null, '读一行', 'line = f.readline()', 'file', 6),
  e('fm-write', ['写入'], ['xie ru'], 'write', 'method', 'write($1)', [{ n: 1, hint: '要写的内容' }], '把内容写进文件', 'f.write("今天天气很好")', 'file', 6),
  e('fm-close', ['关闭'], ['guan bi'], 'close', 'method', 'close()', null, '关闭文件', 'f.close()', 'file', 6),

  // ---------- L2 句式骨架 ----------
  e('pt-for-list', ['遍历列表', '逐个处理'], ['bian li lie biao', 'zhu ge chu li'], 'for…in…', 'pattern', 'for $1 in $2:', [{ n: 1, hint: '元素变量名', tip: '自己起个名字，代表每次拿到的那个' }, { n: 2, hint: '列表名' }], '把列表里每个东西挨个拿出来处理', 'for name in names:\n    print(name)', 'syntax', 3, 2),
  e('pt-for-range', ['重复几次', '遍历数字'], ['chong fu ji ci', 'bian li shu zi'], 'for…range…', 'pattern', 'for i in range($1):', [{ n: 1, hint: '次数' }], '重复固定次数', 'for i in range(10):', 'syntax', 3, 2),
  e('pt-if-else', ['如果否则'], ['ru guo fou ze'], 'if…else…', 'pattern', 'if $1:\n    $2\nelse:\n    $3', [{ n: 1, hint: '条件' }, { n: 2, hint: '成立时做' }, { n: 3, hint: '不成立时做' }], '二选一执行', 'if score >= 60:\n    print("及格")\nelse:\n    print("不及格")', 'syntax', 2, 2),
  e('pt-while-true', ['无限循环', '死循环'], ['wu xian xun huan', 'si xun huan'], 'while True', 'pattern', 'while True:', null, '一直重复（记得配 break）', 'while True:\n    cmd = input("> ")\n    if cmd == "退出":\n        break', 'syntax', 4, 2),
  e('pt-def', ['函数模板', '定义一个函数'], ['han shu mo ban', 'ding yi yi ge han shu'], 'def…():', 'pattern', 'def $1($2):\n    $3', [{ n: 1, hint: '函数名' }, { n: 2, hint: '参数，可空' }, { n: 3, hint: '要做的事' }], '定义函数的完整骨架', 'def add(a, b):\n    return a + b', 'syntax', 5, 2),
  e('pt-read-file', ['读文件'], ['du wen jian'], 'with open r', 'pattern', 'with open($1, "r", encoding="utf-8") as f:\n    $2', [{ n: 1, hint: '文件名' }, { n: 2, hint: '例如 text = f.read()' }], '安全地读文件（自动关闭）', 'with open("日记.txt", "r", encoding="utf-8") as f:\n    print(f.read())', 'file', 6, 2),
  e('pt-write-file', ['写文件'], ['xie wen jian'], 'with open w', 'pattern', 'with open($1, "w", encoding="utf-8") as f:\n    f.write($2)', [{ n: 1, hint: '文件名' }, { n: 2, hint: '要写的内容' }], '安全地写文件（自动关闭）', 'with open("日记.txt", "w", encoding="utf-8") as f:\n    f.write("你好")', 'file', 6, 2),
];

/** 基础语法档（GESP 考试范围）包含的模块；其余模块（turtle/random/time/math…）属创新档 */
export const BASIC_MODULES = ['builtin', 'syntax', 'str', 'list', 'dict', 'file'];

/** 组装最终词条：推导档位 + 函数词条附带方法变体（供 `.` 之后使用） */
function buildAll(): Entry[] {
  const out: Entry[] = [];
  const seen = new Set<string>();
  const withTier = (e: RawEntry): Entry => ({
    ...e,
    tier: (BASIC_MODULES as string[]).includes(e.module) ? 'basic' : 'creative',
  });
  for (const raw of RAW) {
    const entry = withTier(raw);
    if (!seen.has(entry.id)) {
      out.push(entry);
      seen.add(entry.id);
    }
    // 这些模块的函数同时生成方法变体；字符串/列表/字典/文件方法本身已是 method
    if (entry.kind === 'function' && ['turtle', 'random', 'time', 'math'].includes(entry.module)) {
      const v = withTier(methodVariant(entry));
      if (!seen.has(v.id)) {
        out.push(v);
        seen.add(v.id);
      }
    }
  }
  return out;
}

export const ENTRIES: Entry[] = buildAll();
