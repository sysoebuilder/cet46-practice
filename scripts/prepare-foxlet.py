"""Build-time downloads only. Runtime translation never calls the network.
Pinned hashes originate in the SHA-verified v0.5.0 AAR's Mozilla catalog.
"""
import argparse
import hashlib
import io
import json
import pathlib
import shutil
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
NATIVE = ROOT / 'native' / 'foxlet'


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def acquire(url, path, sha256, size=None, check=False):
    if path.is_file() and (size is None or path.stat().st_size == size) and digest(path) == sha256:
        print('verified', path.name, flush=True)
        return
    if check:
        raise RuntimeError(f'Missing/corrupt resource: {path}')
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.part')
    print('downloading', path.name, flush=True)
    request = urllib.request.Request(url, headers={'User-Agent': 'CET46-foxlet-build/1'})
    try:
        with urllib.request.urlopen(request, timeout=60) as source, temporary.open('wb') as target:
            shutil.copyfileobj(source, target)
        if (size is not None and temporary.stat().st_size != size) or digest(temporary) != sha256:
            raise RuntimeError(f'Publisher SHA-256/size mismatch: {path.name}')
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true', help='Offline validation; never download')
    args = parser.parse_args()
    lock = json.loads((NATIVE / 'foxlet.lock.json').read_text())
    aar = NATIVE / 'libs' / 'foxlet-v0.5.0.aar'
    acquire(lock['sdkUrl'], aar, lock['sdkSha256'], check=args.check)
    with zipfile.ZipFile(aar) as archive, zipfile.ZipFile(io.BytesIO(archive.read('classes.jar'))) as classes:
        catalog = classes.read('io/github/yinvoker/foxlet/models.tsv').decode()
        for asset in lock['assets']:
            expected = '\t'.join(['en', 'zh-Hans', lock['modelVersion'], asset['name'], str(asset['size']), asset['sha256'], asset['url']])
            if expected not in catalog.splitlines():
                raise RuntimeError('Lock does not match verified release catalog')
            acquire(asset['url'], NATIVE / 'models' / asset['name'], asset['sha256'], asset['size'], args.check)
        if not args.check:
            for name in classes.namelist():
                if '/licenses/' in name and not name.endswith('/'):
                    target = NATIVE / 'licenses' / pathlib.Path(name).name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(classes.read(name))
    print(f"Foxlet {lock['sdkVersion']}: {sum(a['size'] for a in lock['assets']):,} model bytes verified", flush=True)


if __name__ == '__main__':
    main()
