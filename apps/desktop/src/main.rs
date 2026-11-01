// 小蟒桌面壳：拉起 Python 引擎（Jupyter）与界面服务（serve.py），探测端口后打开主窗口。
// 退出时杀掉全部子进程。

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

struct Children(Mutex<Vec<Child>>);

fn main() {
    tauri::Builder::default()
        .manage(Children(Mutex::new(Vec::new())))
        .setup(|app| {
            let sidecar_dir = find_sidecar_dir();
            let Some(dir) = sidecar_dir.clone() else {
                fatal("没有找到 sidecar 目录。\n请保持本程序在项目结构内运行（sidecar/ 与 apps/web/dist/ 需存在）。");
                return Ok(());
            };
            // 解释器优先级：内嵌便携运行时（绿色发行版）→ 开发 venv
            let portable = dir.join("py-runtime").join("python.exe");
            let venv = dir.join(".venv").join("Scripts").join("python.exe");
            let python = if portable.exists() { portable } else { venv };
            if !python.exists() {
                fatal(&format!(
                    "没有找到 Python 环境：{}\n请先运行项目根目录的 start.bat 完成首次环境准备。",
                    python.display()
                ));
                return Ok(());
            }

            // 清理上次残留的端口文件
            let _ = std::fs::remove_file(dir.join("xm-connection.json"));
            let _ = std::fs::remove_file(dir.join("xm-ui-port.txt"));

            let children = app.state::<Children>();
            {
                let mut guard = children.0.lock().unwrap();
                // 1) Jupyter 引擎
                let mut cmd = Command::new(&python);
                cmd.arg(dir.join("start_jupyter.py")).current_dir(&dir);
                if let Ok(c) = spawn_hidden(&mut cmd).spawn() {
                    guard.push(c);
                }
                // 2) 界面静态服务（稍等引擎先起；标记桌面环境，serve 不再弹浏览器）
                std::thread::sleep(Duration::from_millis(1200));
                let mut cmd = Command::new(&python);
                cmd.arg(dir.join("serve.py"))
                    .current_dir(&dir)
                    .env("XM_DESKTOP", "1");
                if let Ok(c) = spawn_hidden(&mut cmd).spawn() {
                    guard.push(c);
                }
            }

            // 等待界面端口就绪（最长 60 秒：首次冷启动内核较慢）
            let started = Instant::now();
            let port = loop {
                if let Ok(txt) = std::fs::read_to_string(dir.join("xm-ui-port.txt")) {
                    if let Ok(p) = txt.trim().parse::<u16>() {
                        break p;
                    }
                }
                if started.elapsed() > Duration::from_secs(60) {
                    fatal("界面服务启动超时（60 秒）。请重新打开小蟒再试。");
                    return Ok(());
                }
                // 子进程全挂了就别等了
                {
                    let mut guard = children.0.lock().unwrap();
                    if guard.iter_mut().all(|c| matches!(c.try_kill(), KillState::Dead)) {
                        fatal("Python 引擎启动失败。请运行项目根目录 start.bat 查看具体报错。");
                        return Ok(());
                    }
                }
                std::thread::sleep(Duration::from_millis(400));
            };

            let url = format!("http://127.0.0.1:{}", port);
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(url.parse::<tauri::Url>().expect("合法 URL")),
            )
            .title("Python 编程工具")
            .inner_size(1440.0, 900.0)
            .min_inner_size(1024.0, 700.0)
            .build()
            .expect("创建窗口失败");
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("小蟒启动失败")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<Children>() {
                    let mut guard = state.0.lock().unwrap();
                    for c in guard.iter_mut() {
                        let _ = c.kill();
                    }
                }
            }
        });
}

/// 从 exe 所在目录向上找 sidecar/start_jupyter.py（兼容开发目录与发布目录布局）
fn find_sidecar_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let mut dir: Option<&Path> = Some(exe.parent()?);
    // 向上最多 6 层
    for _ in 0..6 {
        let d = dir?;
        if d.join("sidecar").join("start_jupyter.py").exists() {
            return Some(d.join("sidecar"));
        }
        if d.join("start_jupyter.py").exists() {
            return Some(d.to_path_buf());
        }
        dir = d.parent();
    }
    None
}

fn fatal(msg: &str) {
    eprintln!("[小蟒] {}", msg);
    let _ = std::fs::write("xiaomang-error.log", msg);
    #[cfg(windows)]
    {
        use std::os::raw::c_int;
        extern "system" {
            fn MessageBoxA(hwnd: isize, text: *const u8, caption: *const u8, utype: c_int) -> c_int;
        }
        let mut text = msg.as_bytes().to_vec();
        text.push(0);
        let caption = b"Python Tool\0";
        unsafe {
            MessageBoxA(0, text.as_ptr(), caption.as_ptr(), 0x10);
        }
    }
    std::process::exit(1);
}

/// 隐藏子进程的控制台窗口（Windows: CREATE_NO_WINDOW）
#[cfg(windows)]
fn spawn_hidden(cmd: &mut Command) -> &mut Command {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000)
}
#[cfg(not(windows))]
fn spawn_hidden(cmd: &mut Command) -> &mut Command {
    cmd
}

enum KillState {
    Alive,
    Dead,
}

trait TryKill {
    fn try_kill(&mut self) -> KillState;
}

impl TryKill for Child {
    fn try_kill(&mut self) -> KillState {
        match self.try_wait() {
            Ok(Some(_)) => KillState::Dead,
            _ => KillState::Alive,
        }
    }
}
