"""Attach to a supplied working 5+ host; preserves its runtime, AppKey and signing.
No SDK is inferred from an APK or silently replaced with a uni-app SDK.
"""
import argparse
import json
import pathlib
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]


def attach(host, module):
    host = host.resolve()
    app = (host / module).resolve()
    if not app.is_relative_to(host):
        raise ValueError('Application module must stay within host project')
    manifest = app / 'src/main/AndroidManifest.xml'
    if not manifest.is_file():
        raise ValueError('Expected a working Android application module')
    tree = ET.parse(manifest)
    if 'io.dcloud' not in manifest.read_text(encoding='utf-8'):
        raise ValueError('Host has no DCloud activity/application; supply a working 5+ host')
    controls = list(app.glob('src/main/assets/data/dcloud_control.xml'))
    if len(controls) != 1:
        raise ValueError('Host must contain its own assets/data/dcloud_control.xml')
    web = json.loads((ROOT / 'app/manifest.json').read_text(encoding='utf-8-sig'))
    control = ET.parse(controls[0])
    if not any(node.attrib.get('appid') == web['id'] for node in control.iter('app')):
        raise ValueError(f"Configure the existing 5+ host's control appid to {web['id']} first")
    gradle = app / 'build.gradle'
    if not gradle.is_file():
        raise ValueError('Automatic attachment expects a Groovy build.gradle; see docs for Kotlin DSL')
    content = gradle.read_text(encoding='utf-8')
    if 'com.android.application' not in content:
        raise ValueError('Selected module is not an Android application')
    android = '{http://schemas.android.com/apk/res/android}'
    application = tree.getroot().find('application')
    if application is None:
        raise ValueError('Missing application node')
    snippet = "\n// CET Foxlet Native.js integration\napply from: file(project.property('cetFoxletDir') + '/host-integration.gradle')\n"
    if 'host-integration.gradle' not in content:
        backup = gradle.with_suffix('.gradle.before-foxlet')
        if not backup.exists():
            backup.write_text(content, encoding='utf-8')
        gradle.write_text(content + snippet, encoding='utf-8')
    # Only the host's native Android manifest changes. Existing 5+ manifests stay intact.
    if application.get(android + 'extractNativeLibs') != 'true':
        backup = manifest.with_suffix('.xml.before-foxlet')
        if not backup.exists():
            backup.write_bytes(manifest.read_bytes())
        ET.register_namespace('android', 'http://schemas.android.com/apk/res/android')
        application.set(android + 'extractNativeLibs', 'true')
        tree.write(manifest, encoding='utf-8', xml_declaration=True)
    print('Attached. Build using:')
    print(f'gradlew.bat -PcetFoxletDir="{(ROOT / "native/foxlet").as_posix()}" -PcetWebDir="{(ROOT / "app").as_posix()}" :{module}:assembleDebug')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', required=True, type=pathlib.Path)
    parser.add_argument('--module', default='app')
    args = parser.parse_args()
    attach(args.host, args.module)
