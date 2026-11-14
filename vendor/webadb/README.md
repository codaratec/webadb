# webadb — local Tango ADB integration

The browser bundle ports the ADB engine from
[yume-chan/ya-webadb](https://github.com/yume-chan/ya-webadb), also known as Tango
ADB, into this site's static webadb page. It is an integration of the upstream
libraries, with a local user interface; it is not a copy of Tango's hosted app.

The generated `webadb.js` is a self-contained ES module. USB authentication,
shell commands, Android sync file transfers, streamed APK installation, device
properties and PNG screenshots run locally. There is no runtime CDN, backend
relay or device-data upload. Serve the site over HTTPS or localhost in a browser
with WebUSB support, such as desktop Chrome or Edge. Enable USB debugging and
approve the RSA authorization prompt on the Android device. The operating system
must also permit the browser to claim the ADB USB interface; stop another ADB
client if it holds the device. Safari and Firefox do not provide this connection.

The interface intentionally covers the main ADB tools. Tango features such as
scrcpy screen mirroring, audio forwarding, wireless bridges and reverse tunnels
are not included in this port.

## Rebuild

From `tools/webadb`, run:

```sh
npm ci --registry=https://registry.npmjs.org
npm run build
npm test
```

Node.js 22 or later is recommended. All package versions, including transitive
dependencies, are locked in `tools/webadb/package-lock.json`. Source lives in
`tools/webadb/src/webadb.js`. `manifest.json` records the exact bundled package
versions and output SHA-256; a fresh build requires no network after `npm ci`.
Do not edit the generated bundle directly.

## Facade contract

```js
import { WebAdbClient, UPSTREAM } from './webadb.js';
const client = new WebAdbClient();
await client.connect({ onStatus: status => console.log(status) });
await client.getDeviceInfo();
const result = await client.shell('getprop ro.product.model', {
  onOutput: (text, stream) => console.log(stream, text),
  signal: abortController.signal,
});
await client.list('/sdcard/');
await client.push('/sdcard/example.txt', file, { onProgress });
const blob = await client.pull('/sdcard/example.txt', { onProgress });
await client.installApk(apkFile, { onProgress });
const png = await client.screenshot();
await client.disconnect();
```

- `connect()` must run from a user gesture. Its status values are `selecting`,
  `opening`, `authorizing`, and `connected`; it returns preliminary device info.
  An empty or cancelled chooser reports `NotFoundError`; an explicitly aborted
  connection reports `AbortError`, including when its chooser subsequently closes.
- `getDeviceInfo()` returns `{serial,model,manufacturer,androidVersion,sdk,product}`.
- `shell()` returns `{stdout,stderr,exitCode}`. `onOutput(text,stream)` receives
  every decoded chunk; the retained result holds at most the final 1 MiB per
  channel. An abort closes the ADB process socket. Older Android exec protocol
  combines stdout/stderr and returns `exitCode: null`.
- `list()` returns `{name,type,size,mtime}[]`; types are `directory`, `file`,
  `symlink`, or `other`, sizes are bytes and modification times are Unix seconds.
- Progress callbacks receive `{transferred,total}` in bytes. `total` may be
  unavailable for a pull. Push and APK installation read `File.stream()` in
  bounded chunks. APK installation uses upstream's streaming PackageManager
  with its push/install fallback for older Android versions.
- `pull(path,{writable})` streams directly to a `WritableStream`, closing it on
  success and aborting it on failure, and returns `null`. Without a writable it
  returns a Blob, which buffers the downloaded file in browser memory.
- `connected`, `deviceInfo`, and a `disconnected` Promise describe the connection.
  `WebAdbClient.supported()` detects the required browser APIs.

RSA private keys are stored only in this origin's IndexedDB database
`73hicom-webadb`, in a store isolated from other Tango clients. They allow the
Android device to recognize this browser on the next connection.
`WebAdbClient.forgetKeys()` clears this tool's saved keys. Disconnect before
clearing them; Android's existing authorized-key list is unchanged until the
user revokes USB debugging authorizations in device settings.

## Licenses

Upstream code is MIT-licensed, copyright Simon Chan. See `LICENSE` and the exact
bundled package notices in `THIRD_PARTY_NOTICES.txt`. `adb.NOTICE` preserves the
AOSP / Apache-2.0 notice distributed by upstream.
