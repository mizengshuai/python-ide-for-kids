/** Python 内置名（did-you-mean 拼写建议用） */
export const PY_BUILTINS = [
  'print', 'input', 'len', 'range', 'int', 'float', 'str', 'bool', 'list', 'dict',
  'tuple', 'set', 'sum', 'max', 'min', 'abs', 'round', 'sorted', 'reversed', 'enumerate',
  'zip', 'type', 'open', 'format', 'help', 'ord', 'chr', 'isinstance', 'map', 'filter',
  'any', 'all', 'id', 'hash', 'dir', 'vars', 'globals', 'locals',
  'if', 'elif', 'else', 'for', 'while', 'def', 'return', 'import', 'from', 'as',
  'break', 'continue', 'pass', 'True', 'False', 'None', 'not', 'and', 'or', 'in',
  'try', 'except', 'finally', 'raise', 'with', 'lambda', 'global', 'is', 'del',
];

/** 常见「模块名 ≠ 包名」映射 */
export const MODULE_TO_PACKAGE: Record<string, string> = {
  PIL: 'pillow',
  cv2: 'opencv-python',
  sklearn: 'scikit-learn',
  yaml: 'pyyaml',
  bs4: 'beautifulsoup4',
  sqlite3: '', // 标准库
  serial: 'pyserial',
  'requests': 'requests',
};
