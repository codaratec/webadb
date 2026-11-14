import { WebAdbClient } from '../vendor/webadb/webadb.js';

// Paths, filenames and device output are data, never HTML or translated copy.
export function normalizePath(value) {
    if (typeof value !== 'string' || value.includes('\0')) throw new Error('Invalid path.');
    const parts = [];
    for (const part of value.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') parts.pop();
        else parts.push(part);
    }
    return '/' + parts.join('/');
}

export function joinPath(directory, name) {
    if (!name || name === '.' || name === '..' || /[/\0]/.test(name)) throw new Error('Invalid filename.');
    return normalizePath(directory + '/' + name);
}

export function formatBytes(value) {
    const size = Number(value);
    if (!Number.isFinite(size) || size < 0) return '—';
    if (size < 1024) return `${size} B`;
    const unit = Math.min(3, Math.floor(Math.log(size) / Math.log(1024)));
    return `${(size / 1024 ** unit).toFixed(1)} ${['B', 'KB', 'MB', 'GB'][unit]}`;
}

export function mountWebAdb(doc = document, Client = WebAdbClient, env = window) {
    const ids = ['connectBtn', 'disconnectBtn', 'forgetKeyBtn', 'connectionStatus', 'connectionBadge',
        'statusLine', 'deviceName', 'deviceInfo', 'deviceControls', 'shellForm', 'shellCommand',
        'runCommandBtn', 'stopCommandBtn', 'clearShellBtn', 'shellOutput', 'fileForm', 'remotePath',
        'listFilesBtn', 'parentDirBtn', 'refreshFilesBtn', 'uploadBtn', 'uploadInput', 'fileTableBody',
        'fileCount', 'apkInput', 'installApkBtn', 'apkFileName', 'installStatus',
        'captureScreenshotBtn', 'downloadScreenshotBtn', 'screenshotPreview', 'screenshotEmpty'];
    const ui = Object.fromEntries(ids.map(id => [id, doc.getElementById(id)]));
    if (ids.some(id => !ui[id])) throw new Error('Incomplete webadb interface.');
    const t = (message, values) => env.SiteLanguage?.t(message, values) ?? message.replace(/\{(\w+)\}/g, (s, k) => values?.[k] ?? s);
    let client = null;
    let generation = 0;
    let connecting = false;
    let connectAbort = null;
    let busy = false;
    let shellAbort = null;
    let currentPath = '/sdcard';
    let screenshotUrl = '';
    let disposed = false;
    const MAX_OUTPUT = 1024 * 1024;

    function message(text, kind = 'info', values) {
        ui.statusLine.textContent = t(text, values);
        ui.statusLine.className = 'webadb-notice is-' + kind;
        ui.statusLine.hidden = false;
    }

    function updateControls() {
        const connected = Boolean(client?.connected);
        ui.connectBtn.disabled = connecting || connected || !Client.supported();
        ui.disconnectBtn.disabled = !client || (!connecting && !connected);
        ui.forgetKeyBtn.disabled = connecting || connected;
        ui.deviceControls.disabled = !connected;
        ui.deviceControls.querySelectorAll('button, input, textarea').forEach(node => { node.disabled = busy; });
        ui.stopCommandBtn.disabled = !shellAbort || !connected;
        ui.clearShellBtn.disabled = false;
        ui.installApkBtn.disabled = busy || !ui.apkInput.files?.length;
        ui.downloadScreenshotBtn.disabled = busy || !screenshotUrl;
        ui.parentDirBtn.disabled = busy || currentPath === '/';
        ui.connectionStatus.textContent = t(connecting ? 'Connecting…' : connected ? 'Connected' : 'Disconnected');
        ui.connectionBadge.classList.toggle('is-connected', connected);
        ui.connectionBadge.classList.toggle('is-connecting', connecting);
    }

    function clearScreenshot() {
        if (screenshotUrl) env.URL.revokeObjectURL(screenshotUrl);
        screenshotUrl = '';
        ui.screenshotPreview.removeAttribute('src');
        ui.screenshotPreview.hidden = true;
        ui.screenshotEmpty.hidden = false;
    }

    function emptyFiles(text = 'Connect a device to browse files.') {
        const row = doc.createElement('tr');
        const cell = doc.createElement('td');
        cell.colSpan = 4;
        cell.className = 'webadb-empty';
        cell.textContent = t(text);
        row.append(cell);
        ui.fileTableBody.replaceChildren(row);
        ui.fileCount.textContent = '';
    }

    function showInfo(info) {
        ui.deviceInfo.hidden = false;
        ui.deviceName.textContent = info.model || info.product || info.serial || t('Android device');
        ui.deviceInfo.replaceChildren();
        for (const [label, key] of [['Model', 'model'], ['Manufacturer', 'manufacturer'], ['Serial number', 'serial'],
            ['Android version', 'androidVersion'], ['SDK level', 'sdk']]) {
            const term = doc.createElement('dt');
            const value = doc.createElement('dd');
            term.textContent = t(label);
            value.textContent = info[key] || '—';
            value.dir = 'ltr';
            const item = doc.createElement('div');
            item.append(term, value);
            ui.deviceInfo.append(item);
        }
    }

    function resetConnection() {
        generation++;
        connectAbort?.abort();
        connectAbort = null;
        shellAbort?.abort();
        shellAbort = null;
        connecting = false;
        busy = false;
        client = null;
        ui.deviceName.textContent = t('No device connected');
        ui.deviceInfo.replaceChildren();
        ui.deviceInfo.hidden = true;
        ui.installStatus.hidden = true;
        emptyFiles();
        clearScreenshot();
        updateControls();
    }

    function errorMessage(error) {
        if (error?.name === 'NotFoundError') return message('No ADB device selected. If the USB list is empty, check the data cable, USB mode and ADB driver.');
        if (error?.name === 'AbortError') return message('Operation stopped.');
        message('Operation failed. Check the device connection and try again.', 'error');
        // Keep technical details literal; Android messages can contain paths or filenames.
        if (error?.message) ui.statusLine.append(doc.createTextNode(' ' + String(error.message).slice(0, 1000)));
    }

    async function operation(action) {
        if (busy || !client?.connected) return;
        const active = client;
        const version = generation;
        const current = () => !disposed && generation === version && client === active;
        busy = true;
        updateControls();
        try { await action(active, current); }
        catch (error) { if (current()) errorMessage(error); }
        finally {
            if (current()) {
                busy = false;
                shellAbort = null;
                updateControls();
            }
        }
    }

    function saveBlob(blob, name) {
        const url = env.URL.createObjectURL(blob);
        const anchor = doc.createElement('a');
        anchor.href = url;
        anchor.download = name.replace(/[\\/\0]/g, '_');
        doc.body.append(anchor);
        anchor.click();
        anchor.remove();
        // Keep the URL alive until the browser has consumed the download.
        env.setTimeout(() => env.URL.revokeObjectURL(url), 60000);
    }

    async function listFiles(active, current, path) {
        const destination = normalizePath(path);
        message('Reading files…');
        const entries = await active.list(destination);
        if (!current()) return;
        currentPath = destination;
        ui.remotePath.value = destination;
        ui.fileTableBody.replaceChildren();
        const safeEntries = entries.filter(entry => entry.name && !['.', '..'].includes(entry.name));
        safeEntries.sort((a, b) => (b.type === 'directory') - (a.type === 'directory') || a.name.localeCompare(b.name));
        if (!safeEntries.length) emptyFiles('This folder is empty.');
        for (const entry of safeEntries) {
            const row = doc.createElement('tr');
            const nameCell = doc.createElement('td');
            const name = doc.createElement(entry.type === 'directory' ? 'button' : 'span');
            name.textContent = entry.name;
            name.dir = 'ltr';
            if (entry.type === 'directory') {
                name.type = 'button';
                name.className = 'file-link';
                name.disabled = true;
                name.addEventListener('click', () => operation((adb, isCurrent) => listFiles(adb, isCurrent, joinPath(currentPath, entry.name))));
            }
            nameCell.append(name);
            const typeCell = doc.createElement('td');
            typeCell.textContent = t(entry.type === 'directory' ? 'Folder' : entry.type === 'symlink' ? 'Symbolic link' : 'File');
            const sizeCell = doc.createElement('td');
            sizeCell.textContent = entry.type === 'directory' ? '—' : formatBytes(entry.size);
            sizeCell.dir = 'ltr';
            const actionCell = doc.createElement('td');
            if (entry.type !== 'directory') {
                const button = doc.createElement('button');
                button.type = 'button';
                button.className = 'file-download';
                button.textContent = t('Download');
                button.disabled = true;
                button.addEventListener('click', () => operation(async (adb, isCurrent) => {
                    message('Downloading {name}…', 'info', { name: entry.name });
                    const path = joinPath(currentPath, entry.name);
                    if (typeof env.showSaveFilePicker === 'function') {
                        const handle = await env.showSaveFilePicker({ suggestedName: entry.name });
                        if (!isCurrent()) return;
                        const writable = await handle.createWritable();
                        if (!isCurrent()) { await writable.abort(); return; }
                        try { await adb.pull(path, { writable }); }
                        catch (error) {
                            await writable.abort(error).catch(() => {});
                            throw error;
                        }
                    } else {
                        const blob = await adb.pull(path);
                        if (!isCurrent()) return;
                        saveBlob(blob, entry.name);
                    }
                    if (!isCurrent()) return;
                    message('Download ready.', 'success');
                }));
                actionCell.append(button);
            }
            row.append(nameCell, typeCell, sizeCell, actionCell);
            ui.fileTableBody.append(row);
        }
        ui.fileCount.textContent = t('{count} items', { count: safeEntries.length });
        message('Files refreshed.', 'success');
    }

    ui.connectBtn.addEventListener('click', async () => {
        if (client || !Client.supported()) return;
        const version = ++generation;
        const active = new Client();
        client = active;
        connecting = true;
        connectAbort = new AbortController();
        updateControls();
        const connectionMessages = {
            selecting: 'Choose your Android device in the USB picker. An empty list means no compatible ADB interface is visible.',
            opening: 'Opening the USB device…',
            authorizing: 'Unlock Android and approve the USB debugging prompt.'
        };
        message(connectionMessages.selecting);
        try {
            await active.connect({ signal: connectAbort.signal, onStatus: status => {
                if (generation === version && connectionMessages[status]) message(connectionMessages[status]);
            }});
            if (generation !== version || disposed) { await active.disconnect(); return; }
            connecting = false;
            connectAbort = null;
            active.disconnected.then(() => {
                if (client === active) { resetConnection(); message('Device disconnected.'); }
            }, () => {
                if (client === active) { resetConnection(); message('Device disconnected.'); }
            });
            showInfo(active.deviceInfo || {});
            updateControls();
            message('Connected. Your device is ready.', 'success');
            await operation(async (adb, current) => {
                const info = await adb.getDeviceInfo();
                if (!current()) return;
                showInfo(info);
                await listFiles(adb, current, currentPath);
            });
        } catch (error) {
            if (generation === version) {
                resetConnection();
                errorMessage(error);
            }
            await active.disconnect().catch(() => {});
        }
    });

    ui.disconnectBtn.addEventListener('click', async () => {
        const active = client;
        resetConnection();
        message('Device disconnected.');
        await active?.disconnect().catch(() => {});
    });

    ui.forgetKeyBtn.addEventListener('click', async () => {
        if (client || connecting || ui.forgetKeyBtn.disabled) return;
        ui.forgetKeyBtn.disabled = true;
        try { await Client.forgetKeys(); message('Saved ADB key removed.', 'success'); }
        catch (error) { errorMessage(error); }
        finally { updateControls(); }
    });

    function appendOutput(chunk) {
        ui.shellOutput.textContent = (ui.shellOutput.textContent + chunk).slice(-MAX_OUTPUT);
        ui.shellOutput.scrollTop = ui.shellOutput.scrollHeight;
    }

    ui.shellForm.addEventListener('submit', event => {
        event.preventDefault();
        const command = ui.shellCommand.value.trim();
        if (!command) return message('Enter a shell command.', 'error');
        operation(async (adb, current) => {
            shellAbort = new AbortController();
            updateControls();
            appendOutput('$ ' + command + '\n');
            message('Running command…');
            const result = await adb.shell(command, {
                signal: shellAbort.signal,
                onOutput: chunk => { if (current()) appendOutput(chunk); }
            });
            if (!current()) return;
            if (shellAbort.signal.aborted) return message('Operation stopped.');
            message('Command finished (exit {code}).', result.exitCode == null ? 'info' : result.exitCode === 0 ? 'success' : 'error', { code: result.exitCode ?? '—' });
        });
    });
    ui.stopCommandBtn.addEventListener('click', () => shellAbort?.abort());
    ui.clearShellBtn.addEventListener('click', () => { ui.shellOutput.textContent = ''; });
    ui.fileForm.addEventListener('submit', event => {
        event.preventDefault();
        operation((adb, current) => listFiles(adb, current, ui.remotePath.value));
    });
    ui.refreshFilesBtn.addEventListener('click', () => operation((adb, current) => listFiles(adb, current, currentPath)));
    ui.parentDirBtn.addEventListener('click', () => operation((adb, current) => listFiles(adb, current, normalizePath(currentPath + '/..'))));
    ui.uploadBtn.addEventListener('click', () => { if (!busy && client?.connected) ui.uploadInput.click(); });
    ui.uploadInput.addEventListener('change', () => {
        const files = Array.from(ui.uploadInput.files || []);
        ui.uploadInput.value = '';
        if (!files.length) return;
        operation(async (adb, current) => {
            const entries = await adb.list(currentPath);
            if (!current()) return;
            const occupied = new Set(entries.map(entry => entry.name));
            // An explicit prompt protects existing device files during a batch upload.
            if (files.some(file => occupied.has(file.name)) && !env.confirm(t('Replace files with the same name in this folder?'))) return;
            for (const file of files) {
                if (!current()) return;
                message('Uploading {name}…', 'info', { name: file.name });
                await adb.push(joinPath(currentPath, file.name), file);
            }
            if (current()) {
                await listFiles(adb, current, currentPath);
                if (current()) message('Upload complete.', 'success');
            }
        });
    });

    ui.apkInput.addEventListener('change', () => {
        ui.apkFileName.textContent = ui.apkInput.files?.[0]?.name || t('No file selected');
        ui.installStatus.hidden = true;
        updateControls();
    });
    ui.installApkBtn.addEventListener('click', () => {
        const file = ui.apkInput.files?.[0];
        if (!file) return;
        if (!/\.apk$/i.test(file.name)) return message('Choose an APK file.', 'error');
        operation(async (adb, current) => {
            message('Installing APK…');
            ui.installStatus.textContent = t('Installing APK…');
            ui.installStatus.hidden = false;
            try {
                await adb.installApk(file);
                if (current()) {
                    ui.installStatus.textContent = t('APK installed successfully.');
                    message('APK installed successfully.', 'success');
                }
            } catch (error) {
                if (current()) ui.installStatus.hidden = true;
                throw error;
            }
        });
    });
    ui.captureScreenshotBtn.addEventListener('click', () => operation(async (adb, current) => {
        message('Capturing screenshot…');
        const blob = await adb.screenshot();
        if (!current()) return;
        clearScreenshot();
        screenshotUrl = env.URL.createObjectURL(blob);
        ui.screenshotPreview.src = screenshotUrl;
        ui.screenshotPreview.hidden = false;
        ui.screenshotEmpty.hidden = true;
        message('Screenshot ready.', 'success');
    }));
    ui.downloadScreenshotBtn.addEventListener('click', () => {
        if (!screenshotUrl) return;
        const anchor = doc.createElement('a');
        anchor.href = screenshotUrl;
        anchor.download = 'webadb-screenshot.png';
        doc.body.append(anchor);
        anchor.click();
        anchor.remove();
    });

    function dispose() {
        if (disposed) return;
        disposed = true;
        const active = client;
        resetConnection();
        active?.disconnect().catch(() => {});
    }
    env.addEventListener('pagehide', dispose);
    env.addEventListener('pageshow', event => {
        if (event.persisted) { disposed = false; updateControls(); }
    });
    emptyFiles();
    updateControls();
    if (!Client.supported()) message('Use Chrome or Edge over HTTPS or localhost to connect with WebUSB.', 'error');
    return { dispose };
}

if (typeof document !== 'undefined' && document.getElementById('connectBtn')) mountWebAdb();
