"""Stage an ordinary 5+ app with the supplied SDK. Never changes input assets."""
import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE = ROOT / 'native/foxlet/host-app'


def copy_tree(source, destination):
    if source.is_file():
        destination.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination / source.name)
        return
    for path in source.rglob('*'):
        parts = path.relative_to(source).parts
        if path.is_file() and not any(part.startswith('.') or part in {'unpackage', 'node_modules'} for part in parts):
            target = destination / path.relative_to(source)
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists() or target.stat().st_size != path.stat().st_size or target.stat().st_mtime_ns != path.stat().st_mtime_ns:
                shutil.copy2(path, target)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sdk', required=True, type=pathlib.Path)
    parser.add_argument('--output', required=True, type=pathlib.Path)
    args = parser.parse_args()
    sdk_lock = json.loads((ROOT / 'native/foxlet/dcloud-sdk.lock.json').read_text())
    for library in sdk_lock['libraries']:
        library_path = args.sdk / 'SDK/libs' / library['name']
        with library_path.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        if library_path.stat().st_size != library['size'] or digest != library['sha256']:
            raise ValueError(f"DCloud SDK {sdk_lock['version']} integrity mismatch: {library['name']}")
    output = args.output.resolve()
    if not output.is_relative_to((MODULE / 'build').resolve()):
        raise ValueError('Generated assets must stay within host-app/build')
    app = ROOT / 'app'
    manifest = json.loads((app / 'manifest.json').read_text(encoding='utf-8-sig'))
    app_id = manifest['id']
    if not manifest.get('plus') or manifest['launch_path'] != 'index.html' or 'uni-app' in manifest['plus']:
        raise ValueError('Expected ordinary HTML5+ resources')
    data = output / 'main/data'
    data.mkdir(parents=True, exist_ok=True)
    icon = output / 'res/drawable/icon.png'
    icon.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(app / 'static/brand/icon-192.png', icon)
    copy_tree(args.sdk / 'SDK/assets/data', data)
    properties = ET.parse(data / 'dcloud_properties.xml')
    needed = {'Audio', 'Console', 'Device', 'File', 'Storage', 'Invocation', 'Navigator', 'NativeUI', 'UI', 'Runtime', 'XMLHttpRequest', 'Zip', 'NativeObj', 'Cache'}
    for feature in list(properties.getroot().find('features')):
        if feature.get('name') not in needed:
            properties.getroot().find('features').remove(feature)
    services = properties.getroot().find('services')
    if services is not None:
        for service in list(services): services.remove(service)
    properties.write(data / 'dcloud_properties.xml', encoding='utf-8', xml_declaration=True)
    (data / 'dcloud_control.xml').write_text(f'<hbuilder><apps><app appid="{app_id}" appver=""/></apps></hbuilder>\n', encoding='utf-8')
    full = output / 'full/apps' / app_id / 'www'
    stale_cache = (full / 'unpackage').resolve()
    if not stale_cache.is_relative_to(output) or not output.is_relative_to((MODULE / 'build').resolve()):
        raise ValueError('Refusing to remove files outside generated host assets')
    if stale_cache.exists():
        shutil.rmtree(stale_cache)
    copy_tree(app, full)
    full_manifest = dict(manifest)
    full_manifest['version'] = {'name': '0.1.0-foxlet-test.2', 'code': '13'}
    (full / 'manifest.json').write_text(json.dumps(full_manifest, ensure_ascii=False), encoding='utf-8')
    probe = output / 'probe/apps' / app_id / 'www'
    probe.mkdir(parents=True, exist_ok=True)
    shutil.copy2(MODULE / 'src/probe/index.html', probe / 'index.html')
    subprocess.run(['node', str(ROOT / 'scripts/build-5plus-probe.mjs')], cwd=ROOT, check=True)
    shutil.copy2(MODULE / 'build/probe-js/translator.js', probe / 'translator.js')
    probe_manifest = dict(manifest)
    probe_manifest['name'] = 'CET Native.js 验证'
    probe_manifest['version'] = {'name': '0.1.0-probe', 'code': '11'}
    probe_manifest['plus'] = dict(manifest['plus'])
    probe_manifest['plus']['splashscreen'] = {'autoclose': True, 'waiting': False, 'delay': 0}
    (probe / 'manifest.json').write_text(json.dumps(probe_manifest, ensure_ascii=False), encoding='utf-8')
    licenses = output / 'main/licenses/dcloud'
    licenses.mkdir(parents=True, exist_ok=True)
    shutil.copy2(args.sdk / 'license.md', licenses / 'license.md')
    copy_tree(args.sdk / 'readme/AndroidThirdPartyNotices', licenses / 'third-party')
    print('Staged original 5+ web assets and Native.js probe; no uni-app page/service assets')


if __name__ == '__main__':
    main()
