import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

/** 精选学生主题（设置里可切换，localStorage 记忆） */
export interface XmTheme {
  id: string;
  label: string;
  dot: string; // 设置按钮上的色点
}

export const THEMES: XmTheme[] = [
  { id: 'xm-light', label: '薄荷绿', dot: '#4ecb63' },
  { id: 'xm-paper', label: '纯白', dot: '#ffffff' },
  { id: 'xm-sepia', label: '米黄护眼', dot: '#f5e9c8' },
  { id: 'xm-dark', label: '夜空', dot: '#2b3446' },
];

/** 薄荷绿（默认）：浅色护眼，绿色点缀 */
monaco.editor.defineTheme('xm-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '8a8f98', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c2185b' },
    { token: 'string', foreground: '2e7d32' },
    { token: 'number', foreground: 'e65100' },
    { token: 'identifier', foreground: '1a1a1a' },
  ],
  colors: {
    'editor.background': '#ffffff',
    'editorLineNumber.foreground': '#b0b6bf',
    'editor.lineHighlightBackground': '#f2f8f2',
    'editorCursor.foreground': '#2f9e44',
    'editor.selectionBackground': '#d3ecd8',
  },
});

/** 纯白：教室投影最清晰，经典配色 */
monaco.editor.defineTheme('xm-paper', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '9e9e9e', fontStyle: 'italic' },
    { token: 'keyword', foreground: '0000d0' },
    { token: 'string', foreground: '007000' },
    { token: 'number', foreground: 'b06000' },
    { token: 'identifier', foreground: '111111' },
  ],
  colors: {
    'editor.background': '#ffffff',
    'editorLineNumber.foreground': '#aaaaaa',
    'editor.lineHighlightBackground': '#f5f5f5',
    'editorCursor.foreground': '#333333',
    'editor.selectionBackground': '#cfe8ff',
  },
});

/** 米黄护眼：暖色底，长时间书写不累 */
monaco.editor.defineTheme('xm-sepia', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: 'a89a7d', fontStyle: 'italic' },
    { token: 'keyword', foreground: '9a4e1f' },
    { token: 'string', foreground: '58752f' },
    { token: 'number', foreground: 'b06010' },
    { token: 'identifier', foreground: '3f3728' },
  ],
  colors: {
    'editor.background': '#faf4e3',
    'editorLineNumber.foreground': '#c8bda0',
    'editor.lineHighlightBackground': '#f3ead2',
    'editorCursor.foreground': '#8a6d1a',
    'editor.selectionBackground': '#e8dcae',
  },
});

/** 夜空：深色，高年级/晚间，语法色明亮 */
monaco.editor.defineTheme('xm-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '7d8b7f', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c792ea' },
    { token: 'string', foreground: '9ece6a' },
    { token: 'number', foreground: 'ff9e64' },
    { token: 'identifier', foreground: 'e6edf3' },
  ],
  colors: {
    'editor.background': '#22282e',
    'editorLineNumber.foreground': '#5a646c',
    'editor.lineHighlightBackground': '#2b333b',
    'editorCursor.foreground': '#7ee787',
    'editor.selectionBackground': '#3d5a80',
  },
});

(window as any).__monaco = monaco;

export default monaco;
