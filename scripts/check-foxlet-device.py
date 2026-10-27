"""Actual native smoke test. Never installs over the study app; no fake engine.
Requires a disposable emulator or an explicitly supplied device serial.
"""
import argparse
import hashlib
import json
import os
import pathlib
import re
import subprocess
import time
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
PACKAGE = 'com.hexun.cet.foxlet.smoke'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--adb', default=str(pathlib.Path(os.environ['LOCALAPPDATA']) / 'Android/Sdk/platform-tools/adb.exe'))
    parser.add_argument('--serial', required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    parser.add_argument('--expect-unsupported', action='store_true')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    def adb(*parameters):
        return subprocess.check_output([args.adb, '-s', args.serial, *parameters], timeout=30).decode('utf-8', errors='replace')

    def snapshot(name):
        adb('shell', 'uiautomator', 'dump', '/sdcard/cet-foxlet-smoke.xml')
        data = adb('shell', 'cat', '/sdcard/cet-foxlet-smoke.xml')
        (args.output / f'{name}.xml').write_text(data, encoding='utf-8')
        return ET.fromstring(data)

    def tap(text):
        tree = snapshot('screen')
        node = next(node for node in tree.iter('node') if node.get('text') == text)
        x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
        adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))

    def wait_for(expected, name):
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            tree = snapshot(name)
            texts = '\n'.join(node.get('text', '') for node in tree.iter('node'))
            if expected in texts:
                return texts
            if 'TRANSLATION_FAILED' in texts or 'MODEL_CORRUPT' in texts:
                raise AssertionError(texts)
            time.sleep(1)
        raise TimeoutError(expected)

    abi = adb('shell', 'getprop', 'ro.product.cpu.abilist').strip()
    if not args.expect_unsupported:
        assert abi.split(',')[0] == 'arm64-v8a', 'Real inference requires native ARM64'
    apk = ROOT / 'native/foxlet/smoke/build/outputs/apk/debug/smoke-debug.apk'
    adb('install', '-r', str(apk))
    # The APK has no INTERNET permission. No change to the user's network settings.
    adb('shell', 'am', 'force-stop', PACKAGE)
    adb('shell', 'am', 'start', '-n', PACKAGE + '/.SmokeActivity')
    time.sleep(1)
    tap('初始化')
    report = dict(serial=args.serial, abi=abi, apkSha256=hashlib.sha256(apk.read_bytes()).hexdigest(), networkPermission=False)
    if args.expect_unsupported:
        texts = wait_for('UNSUPPORTED_DEVICE', 'unsupported')
        assert adb('shell', 'pidof', PACKAGE).strip()
        report.update(unsupportedHandled=True, inferencePassed=False)
    else:
        wait_for('"ready":true', 'initialized')
        tap('离线翻译')
        translated = wait_for('translation\n', 'translation')
        assert re.search(r'[\u4e00-\u9fff]', translated.split('translation\n', 1)[1].split('\n', 1)[0]), translated
        assert '"initializations":1' in translated
        tap('离线翻译')
        assert '"initializations":1' in wait_for('translation\n', 'reused')
        before = adb('shell', 'run-as', PACKAGE, 'ls', '-l', 'no_backup/cet-foxlet/en-zh-Hans-2.2')
        adb('shell', 'am', 'force-stop', PACKAGE)
        adb('shell', 'am', 'start', '-n', PACKAGE + '/.SmokeActivity')
        time.sleep(1)
        tap('初始化'); wait_for('"ready":true', 'restarted')
        after = adb('shell', 'run-as', PACKAGE, 'ls', '-l', 'no_backup/cet-foxlet/en-zh-Hans-2.2')
        assert before == after, 'Restart unexpectedly recopied the model'
        report.update(inferencePassed=True, repeatedInitialization=False, restartReusedModel=True)
    screenshot = subprocess.check_output([args.adb, '-s', args.serial, 'exec-out', 'screencap', '-p'], timeout=20)
    (args.output / 'native-result.png').write_bytes(screenshot)
    (args.output / 'device-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
