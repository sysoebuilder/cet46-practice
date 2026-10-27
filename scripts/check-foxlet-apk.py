"""Verify real final APK contents; does not claim on-device inference or ABI compatibility."""
import argparse
import hashlib
import json
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]


def verify(apk, smoke=False, probe=False):
    lock = json.loads((ROOT / 'native/foxlet/foxlet.lock.json').read_text())
    with zipfile.ZipFile(apk) as archive:
        names = archive.namelist()
        for asset in lock['assets']:
            name = 'assets/foxlet/en-zh-Hans-2.2/' + asset['name']
            data = archive.read(name)
            assert len(data) == asset['size'] and hashlib.sha256(data).hexdigest() == asset['sha256'], name
        assert json.loads(archive.read('assets/foxlet/foxlet.lock.json')) == lock
        for license_name in ['NOTICE.txt', 'SOURCE.txt', 'THIRD_PARTY_NOTICES.txt', 'MODEL-MPL-2.0.txt']:
            assert archive.read('assets/foxlet/licenses/' + license_name), license_name
        dex = b''.join(archive.read(name) for name in names if name.endswith('.dex'))
        if smoke or probe or b'Lcom/hexun/cet/host/CetApplication;' in dex:
            manifest_bytes = archive.read('AndroidManifest.xml')
            for encoding in ['utf-8', 'utf-16-le']:
                assert 'android.permission.INTERNET'.encode(encoding) not in manifest_bytes, 'Local verification APK must not have network permission'
        for name in ['lib/arm64-v8a/libfoxlet.so', 'lib/arm64-v8a/libc++_shared.so']:
            assert name in names, name
        assert all(name.startswith('lib/arm64-v8a/') for name in names if name.startswith('lib/') and name.endswith('.so')), 'Non-ARM64 libraries'
        for signature in [b'Lcom/hexun/cet/foxlet/FoxletBridge;', b'Lcom/hexun/cet/foxlet/FoxletCallback;', b'Lio/github/yinvoker/foxlet/Foxlet;', b'Lkotlinx/coroutines/CoroutineScope;']:
            assert signature in dex, f'Missing DEX class: {signature}'
        if not smoke:
            manifest = json.loads((ROOT / 'app/manifest.json').read_text(encoding='utf-8-sig'))
            prefix = f"assets/apps/{manifest['id']}/www/"
            if probe:
                assert b'__CET_PROBE__' in archive.read(prefix + 'index.html')
                assert prefix + 'translator.js' in names
            else:
                assert archive.read(prefix + 'index.html') == (ROOT / 'app/index.html').read_bytes(), 'Stale web build'
                assert prefix + 'native-bootstrap.js' in names
            assert b'Lio/dcloud/PandoraEntry;' in dex, 'Missing 5+ runtime'
            bundled_manifest = json.loads(archive.read(prefix + 'manifest.json'))
            assert 'uni-app' not in bundled_manifest.get('plus', {}), 'Unexpected uni-app page runtime'
            assert not any(name.startswith(prefix) and name.endswith(('app-service.js', 'app-view.js')) for name in names), 'Unexpected uni-app service assets'
            assert not any(name.startswith(prefix + 'unpackage/') for name in names), 'HBuilderX build cache was packaged'
            assert not any(name.startswith(prefix) and name.endswith(('.apk', '.aab')) for name in names), 'Nested application package'
    with apk.open('rb') as stream:
        apk_sha256 = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'apk': str(apk.resolve()), 'sha256': apk_sha256,
            'modelBytes': sum(asset['size'] for asset in lock['assets']), 'payloadVerified': True,
            'kind': 'standalone-native-smoke' if smoke else ('5plus-nativejs-probe' if probe else '5plus-host'), 'deviceTested': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('apk', type=pathlib.Path)
    parser.add_argument('--smoke', action='store_true')
    parser.add_argument('--probe', action='store_true')
    parser.add_argument('--report', type=pathlib.Path)
    args = parser.parse_args()
    report = verify(args.apk, args.smoke, args.probe)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))
