#![cfg(windows)]

use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Gdi::{CreateBitmap, DeleteObject, HBITMAP};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
};
use windows::Win32::UI::Shell::{
    DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass, ITaskbarList3, TaskbarList,
    THUMBBUTTON, THBF_ENABLED, THBN_CLICKED, THB_FLAGS, THB_ICON, THB_TOOLTIP,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateIconIndirect, RegisterWindowMessageW, HICON, ICONINFO, WM_COMMAND,
    WM_NCDESTROY,
};

pub const ID_PREV: u32 = 101;
pub const ID_PLAY_PAUSE: u32 = 102;
pub const ID_NEXT: u32 = 103;

const SUBCLASS_ID: usize = 7701;

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static MAIN_HWND: Mutex<Option<isize>> = Mutex::new(None);
static BUTTONS_ADDED: Mutex<bool> = Mutex::new(false);
static IS_PLAYING: Mutex<bool> = Mutex::new(false);
static MSG_TASKBAR_CREATED: OnceLock<u32> = OnceLock::new();

struct TaskbarIcons {
    prev: HICON,
    play: HICON,
    pause: HICON,
    next: HICON,
}

// Implement Send/Sync for cached HICON handles
unsafe impl Send for TaskbarIcons {}
unsafe impl Sync for TaskbarIcons {}

static ICONS: OnceLock<TaskbarIcons> = OnceLock::new();

struct Canvas {
    width: usize,
    height: usize,
    pixels: Vec<u32>,
}

impl Canvas {
    fn new(width: usize, height: usize) -> Self {
        Self {
            width,
            height,
            pixels: vec![0; width * height],
        }
    }

    fn set(&mut self, x: usize, y: usize, color: u32) {
        if x < self.width && y < self.height {
            self.pixels[y * self.width + x] = color;
        }
    }

    fn fill_rect(&mut self, x0: usize, y0: usize, x1: usize, y1: usize, color: u32) {
        for y in y0..=y1 {
            for x in x0..=x1 {
                self.set(x, y, color);
            }
        }
    }
}

unsafe fn create_hicon_from_canvas(canvas: &Canvas) -> Option<HICON> {
    let color_bmp: HBITMAP = CreateBitmap(
        canvas.width as i32,
        canvas.height as i32,
        1,
        32,
        Some(canvas.pixels.as_ptr() as *const _),
    );

    // 24 width monochrome bitmap padded to 4 bytes per row (96 bytes for 24 rows)
    let mask_bytes = vec![0u8; 96];
    let mask_bmp: HBITMAP = CreateBitmap(
        canvas.width as i32,
        canvas.height as i32,
        1,
        1,
        Some(mask_bytes.as_ptr() as *const _),
    );

    let mut icon_info = ICONINFO {
        fIcon: true.into(),
        xHotspot: 0,
        yHotspot: 0,
        hbmMask: mask_bmp,
        hbmColor: color_bmp,
    };

    let icon = CreateIconIndirect(&mut icon_info).ok();
    let _ = DeleteObject(color_bmp.into());
    let _ = DeleteObject(mask_bmp.into());
    icon
}

fn render_prev_icon() -> Option<HICON> {
    let mut canvas = Canvas::new(24, 24);
    let white = 0xFFFFFFFF;

    // Left vertical bar: x from 4 to 6, y from 5 to 19
    canvas.fill_rect(4, 5, 6, 19, white);

    // Left-pointing triangle: Tip at x=7, y=12; Base at x=18, y=5..=19
    for x in 7..=18 {
        let t = (18 - x) as f32 / 11.0;
        let half_h = 7.0 * (1.0 - t);
        let y_min = (12.0 - half_h).round() as usize;
        let y_max = (12.0 + half_h).round() as usize;
        canvas.fill_rect(x, y_min, x, y_max, white);
    }

    unsafe { create_hicon_from_canvas(&canvas) }
}

fn render_play_icon() -> Option<HICON> {
    let mut canvas = Canvas::new(24, 24);
    let white = 0xFFFFFFFF;

    // Right-pointing triangle: Base at x=7, y=5..=19; Tip at x=18, y=12
    for x in 7..=18 {
        let t = (x - 7) as f32 / 11.0;
        let half_h = 7.0 * (1.0 - t);
        let y_min = (12.0 - half_h).round() as usize;
        let y_max = (12.0 + half_h).round() as usize;
        canvas.fill_rect(x, y_min, x, y_max, white);
    }

    unsafe { create_hicon_from_canvas(&canvas) }
}

fn render_pause_icon() -> Option<HICON> {
    let mut canvas = Canvas::new(24, 24);
    let white = 0xFFFFFFFF;

    // Bar 1: x from 6 to 9, y from 5 to 19
    canvas.fill_rect(6, 5, 9, 19, white);

    // Bar 2: x from 14 to 17, y from 5 to 19
    canvas.fill_rect(14, 5, 17, 19, white);

    unsafe { create_hicon_from_canvas(&canvas) }
}

fn render_next_icon() -> Option<HICON> {
    let mut canvas = Canvas::new(24, 24);
    let white = 0xFFFFFFFF;

    // Right-pointing triangle: Base at x=5, y=5..=19; Tip at x=16, y=12
    for x in 5..=16 {
        let t = (x - 5) as f32 / 11.0;
        let half_h = 7.0 * (1.0 - t);
        let y_min = (12.0 - half_h).round() as usize;
        let y_max = (12.0 + half_h).round() as usize;
        canvas.fill_rect(x, y_min, x, y_max, white);
    }

    // Right vertical bar: x from 17 to 19, y from 5 to 19
    canvas.fill_rect(17, 5, 19, 19, white);

    unsafe { create_hicon_from_canvas(&canvas) }
}

fn get_icons() -> &'static TaskbarIcons {
    ICONS.get_or_init(|| TaskbarIcons {
        prev: render_prev_icon().expect("failed to create prev icon"),
        play: render_play_icon().expect("failed to create play icon"),
        pause: render_pause_icon().expect("failed to create pause icon"),
        next: render_next_icon().expect("failed to create next icon"),
    })
}

fn str_to_u16_260(s: &str) -> [u16; 260] {
    let mut out = [0u16; 260];
    for (i, c) in s.encode_utf16().take(259).enumerate() {
        out[i] = c;
    }
    out
}

fn get_taskbar_list() -> windows::core::Result<ITaskbarList3> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let taskbar: ITaskbarList3 = CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER)?;
        taskbar.HrInit()?;
        Ok(taskbar)
    }
}

pub fn add_taskbar_buttons(hwnd: HWND) {
    let is_playing = *IS_PLAYING.lock().unwrap();
    let icons = get_icons();

    let play_pause_icon = if is_playing { icons.pause } else { icons.play };
    let play_pause_tip = if is_playing { "Pause" } else { "Play" };

    let prev_button = THUMBBUTTON {
        dwMask: THB_ICON | THB_FLAGS | THB_TOOLTIP,
        iId: ID_PREV,
        iBitmap: 0,
        hIcon: icons.prev,
        szTip: str_to_u16_260("Previous"),
        dwFlags: THBF_ENABLED,
    };

    let play_pause_button = THUMBBUTTON {
        dwMask: THB_ICON | THB_FLAGS | THB_TOOLTIP,
        iId: ID_PLAY_PAUSE,
        iBitmap: 0,
        hIcon: play_pause_icon,
        szTip: str_to_u16_260(play_pause_tip),
        dwFlags: THBF_ENABLED,
    };

    let next_button = THUMBBUTTON {
        dwMask: THB_ICON | THB_FLAGS | THB_TOOLTIP,
        iId: ID_NEXT,
        iBitmap: 0,
        hIcon: icons.next,
        szTip: str_to_u16_260("Next"),
        dwFlags: THBF_ENABLED,
    };

    let buttons = [prev_button, play_pause_button, next_button];

    if let Ok(taskbar) = get_taskbar_list() {
        unsafe {
            let res = taskbar.ThumbBarAddButtons(hwnd, &buttons);
            if res.is_ok() {
                *BUTTONS_ADDED.lock().unwrap() = true;
            } else {
                // If buttons were already added previously, update them
                let _ = taskbar.ThumbBarUpdateButtons(hwnd, &buttons);
            }
        }
    }
}

pub fn update_play_state(is_playing: bool) {
    *IS_PLAYING.lock().unwrap() = is_playing;

    let hwnd_opt = *MAIN_HWND.lock().unwrap();
    let hwnd_val = match hwnd_opt {
        Some(val) => HWND(val as *mut _),
        None => return,
    };

    let icons = get_icons();
    let play_pause_icon = if is_playing { icons.pause } else { icons.play };
    let play_pause_tip = if is_playing { "Pause" } else { "Play" };

    let prev_button = THUMBBUTTON {
        dwMask: THB_ICON | THB_FLAGS | THB_TOOLTIP,
        iId: ID_PREV,
        iBitmap: 0,
        hIcon: icons.prev,
        szTip: str_to_u16_260("Previous"),
        dwFlags: THBF_ENABLED,
    };

    let play_pause_button = THUMBBUTTON {
        dwMask: THB_ICON | THB_FLAGS | THB_TOOLTIP,
        iId: ID_PLAY_PAUSE,
        iBitmap: 0,
        hIcon: play_pause_icon,
        szTip: str_to_u16_260(play_pause_tip),
        dwFlags: THBF_ENABLED,
    };

    let next_button = THUMBBUTTON {
        dwMask: THB_ICON | THB_FLAGS | THB_TOOLTIP,
        iId: ID_NEXT,
        iBitmap: 0,
        hIcon: icons.next,
        szTip: str_to_u16_260("Next"),
        dwFlags: THBF_ENABLED,
    };

    let buttons = [prev_button, play_pause_button, next_button];

    if let Ok(taskbar) = get_taskbar_list() {
        unsafe {
            let _ = taskbar.ThumbBarUpdateButtons(hwnd_val, &buttons);
        }
    }
}

unsafe extern "system" fn taskbar_subclass_proc(
    hwnd: HWND,
    umsg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _uidsubclass: usize,
    _dwrefdata: usize,
) -> LRESULT {
    let taskbar_created_msg = MSG_TASKBAR_CREATED.get().copied().unwrap_or(0);

    if taskbar_created_msg != 0 && umsg == taskbar_created_msg {
        add_taskbar_buttons(hwnd);
        return LRESULT(0);
    }

    if umsg == WM_COMMAND {
        let hiword = ((wparam.0 >> 16) & 0xFFFF) as u32;
        if hiword == THBN_CLICKED {
            static LAST_CLICK: Mutex<Option<std::time::Instant>> = Mutex::new(None);
            let now = std::time::Instant::now();
            {
                let mut last = LAST_CLICK.lock().unwrap();
                if let Some(prev) = *last {
                    if now.duration_since(prev).as_millis() < 250 {
                        return LRESULT(0);
                    }
                }
                *last = Some(now);
            }

            let button_id = (wparam.0 & 0xFFFF) as u32;
            if let Some(app) = APP_HANDLE.get() {
                match button_id {
                    ID_PREV => {
                        let _ = app.emit("tray://prev", ());
                    }
                    ID_PLAY_PAUSE => {
                        let _ = app.emit("tray://play-pause", ());
                    }
                    ID_NEXT => {
                        let _ = app.emit("tray://next", ());
                    }
                    _ => {}
                }
            }
            return LRESULT(0);
        }
    } else if umsg == WM_NCDESTROY {
        let _ = RemoveWindowSubclass(hwnd, Some(taskbar_subclass_proc), SUBCLASS_ID);
    }

    DefSubclassProc(hwnd, umsg, wparam, lparam)
}

pub fn init_taskbar(app: AppHandle, hwnd: HWND) {
    let _ = APP_HANDLE.set(app);
    *MAIN_HWND.lock().unwrap() = Some(hwnd.0 as isize);

    unsafe {
        let msg = RegisterWindowMessageW(windows::core::w!("TaskbarButtonCreated"));
        let _ = MSG_TASKBAR_CREATED.set(msg);

        let _ = SetWindowSubclass(hwnd, Some(taskbar_subclass_proc), SUBCLASS_ID, 0);
    }

    // Attempt to add buttons immediately
    add_taskbar_buttons(hwnd);
}
