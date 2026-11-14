# webadb

**Your Android device, connected to your browser.** A standalone, self-hosted web client for ADB over USB: run shell commands, browse and transfer files, install APKs and capture screenshots — entirely in the browser, with nothing uploaded to any server.

> **Live demo:** [https://73hi.com/webadb.html](https://73hi.com/webadb.html)

中文说明见下方 [中文说明](#中文说明)。

---

## Features

- **Direct USB connection** — WebUSB talks to the device's ADB interface; no `adb` binary, no drivers to install beyond the OS default, no cloud relay.
- **Shell** — run arbitrary commands and stream output live (Ctrl/Cmd-friendly terminal view).
- **Files** — browse the device filesystem, navigate directories, upload and download files via ADB sync.
- **Install APK** — stream an APK from your computer and install it on the device.
- **Screenshot** — capture the device screen as a PNG and download it.
- **Key management** — the ADB RSA authentication key is persisted per browser and can be forgotten at any time.

Everything runs **locally**: device data travels directly between your browser and the Android device over USB. There is no backend, no telemetry and no upload of anything you connect or type.

## Requirements

| | |
|---|---|
| Browser | Desktop **Chrome** or **Edge** (WebUSB). Firefox and Safari do not support WebUSB. |
| Page origin | Must be served over **HTTPS** or `localhost`. Open `index.html` via a static server, not `file://`. |
| Device | Android with **Developer options → USB debugging** enabled, connected by USB data cable. |
| OS | The OS must let the browser claim the ADB interface; close other ADB clients first and install vendor USB drivers if needed. |

## Usage

1. Serve this folder over HTTPS or localhost, for example:

   ```bash
   # any static server works
   python -m http.server 8080
   # or
   npx serve .
   ```

2. Open the page in Chrome or Edge, click **Connect device** and pick your Android device in the WebUSB prompt.
3. Approve the RSA authorization dialog on the phone (tick "Always allow" to skip it next time).
4. Use the Shell / Files / Install APK / Screenshot panels.

> The live hosted version is available at [https://73hi.com/webadb.html](https://73hi.com/webadb.html) — you can try it without cloning anything.

## Not included

This integration intentionally covers the main ADB tools. Features from the upstream [Tango ADB](https://github.com/yume-chan/ya-webadb) project that are **not** part of this port:

- `scrcpy`-style screen mirroring and audio forwarding
- Wireless (TCP/IP) ADB bridging
- Reverse tunneling

## Privacy

There is no server component. The page, the bundled ADB engine and your device talk directly over USB; nothing is uploaded, logged or tracked. The ADB key pair stays in the browser's storage.

## Self-hosting

The project is fully static — deploy the folder to any static host (GitHub Pages, Netlify, nginx, …) over HTTPS. No build step, no dependencies to install:

```
webadb/
├── index.html        # the page
├── css/
│   ├── base.css      # design tokens and shared layout
│   └── webadb.css    # tool styles
├── js/
│   └── webadb.js     # UI logic (ES module, mounts itself)
└── vendor/
    └── webadb/       # bundled ADB engine + upstream license notices
```

## Credits & licenses

- The ADB engine is a bundled build of [**ya-webadb** (Tango ADB)](https://github.com/yume-chan/ya-webadb) by Simon Chan — see [`vendor/webadb/LICENSE`](vendor/webadb/LICENSE) (MIT, © Simon Chan) and [`vendor/webadb/THIRD_PARTY_NOTICES.txt`](vendor/webadb/THIRD_PARTY_NOTICES.txt) for upstream notices.
- The page UI and integration in this repository are released under the [MIT License](LICENSE) (© CodaraTec Inc.).
- This project originated as the webadb tool of [73hi Online Tools](https://73hi.com/webadb.html).

## 中文说明

**webadb** 是一个可自托管的浏览器 ADB 客户端:通过 WebUSB 直接连接 Android 设备,支持 Shell 命令、文件浏览与传输、APK 安装和屏幕截图,全程在浏览器内完成,**不上传任何数据**。

- **在线演示**:[https://73hi.com/webadb.html](https://73hi.com/webadb.html)
- **环境要求**:桌面版 Chrome / Edge(支持 WebUSB),页面需通过 HTTPS 或 localhost 访问;手机需开启「开发者选项 → USB 调试」,并用 USB 数据线连接
- **使用方法**:本目录部署到任意静态服务器 → 打开页面 → 点击 **Connect device** 并在弹窗中选择设备 → 在手机上批准 RSA 授权即可
- **隐私**:无后端、无遥测;ADB 密钥仅保存在浏览器本地,可随时点击「Forget saved key」清除
- **限制**:不含 scrcpy 投屏、音频转发、无线 ADB 等上游功能;Firefox / Safari 不支持 WebUSB

ADB 引擎来自 [yume-chan/ya-webadb](https://github.com/yume-chan/ya-webadb)(MIT,详见 `vendor/webadb/LICENSE`);本仓库的界面代码以 MIT 协议开源(见 `LICENSE`)。
