"""Package recordings identified by filenames or reviewed recording/question evidence."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
from pathlib import Path

from pydantic import BaseModel, Field
from listening_reviews import reviewed_additions

APP = Path(__file__).resolve().parents[1]
WORKSPACE = Path('E:/四六级真题')
SOURCE = Path('E:/四六级题库')


class AudioAsset(BaseModel):
    src: str
    sha256: str
    bytes: int


class AudioEvidence(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    quote: str = Field(min_length=1)
    matches: str = Field(min_length=1)


class VerifiedAudio(BaseModel):
    source: str
    sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    paper_ids: list[str] = Field(min_length=1)
    questions_sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    transcript: str
    evidence: list[AudioEvidence] = Field(min_length=2)


class AudioMapping(BaseModel):
    source: str
    paper_id: str | None = None
    paper_ids: list[str] = Field(default_factory=list)
    asset: AudioAsset | None = None
    reason: str = ''
    verification: VerifiedAudio | None = None
    review_source: str | None = None


class AudioReport(BaseModel):
    discovered: int
    mapped: int
    packaged_recordings: int = 0
    total_bytes: int
    files: list[AudioMapping] = Field(default_factory=list)


def explicit_identity(path):
    """A lone file or an ordinal audio track is not evidence of a paper's set number."""
    level = {'四级真题': 'CET4', '六级真题': 'CET6'}.get(path.parents[2].name)
    session = re.fullmatch(r'(20\d{2})\.(\d{2})', path.parents[1].name)
    number = re.search(r'第\s*([123一二三])\s*套', path.stem)
    if not level or not session or not number:
        return None
    set_number = {'一': 1, '二': 2, '三': 3}.get(number.group(1), number.group(1))
    return f'{level}-{session.group(1)}-{session.group(2)}-{set_number}'


def actual_extension(path):
    with path.open('rb') as stream:
        header = stream.read(16)
    if header[4:8] == b'ftyp':
        return '.m4a'
    if header.startswith(b'ID3') or (len(header) > 1 and header[0] == 0xff and header[1] & 0xe0 == 0xe0):
        return '.mp3'
    return None


def listening_signature(paper):
    if paper['Listening']['availability'] != 'available':
        return None
    questions = [question for section in paper['Listening']['sections'] for group in section['groups'] for question in group['questions']]
    if len(questions) != 25:
        return None
    return hashlib.sha256(json.dumps(questions, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def verified_targets(path, record, paper_ids):
    with path.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    if digest != record.sha256:
        raise ValueError('音频摘要与内容核对记录不一致。')
    level = {'四级真题': 'CET4', '六级真题': 'CET6'}.get(path.parents[2].name)
    session = path.parents[1].name.replace('.', '-')
    prefix = f'{level}-{session}-'
    for paper_id in record.paper_ids:
        if paper_id not in paper_ids or not paper_id.startswith(prefix):
            raise ValueError('核对记录的试卷级别或年月不匹配。')
        paper = json.loads((APP / 'src/static/papers' / f'{paper_id}.json').read_text(encoding='utf-8'))
        if listening_signature(paper) != record.questions_sha256:
            raise ValueError('试卷题目或选项顺序与内容核对记录不一致。')
    return list(dict.fromkeys(record.paper_ids))


def main():
    catalog = json.loads((APP / 'src/data/catalog.json').read_text(encoding='utf-8'))
    paper_ids = {p['id'] for p in catalog}
    additions = reviewed_additions(APP)
    proof_path = APP / 'scripts/audio_verified_mappings.json'
    proofs = [VerifiedAudio.model_validate(item) for item in json.loads(proof_path.read_text(encoding='utf-8'))] if proof_path.exists() else []
    proofs_by_source = {str(Path(item.source).resolve()): item for item in proofs}
    files = sorted(p for p in SOURCE.rglob('*') if p.is_file() and p.parent.name == '听力音频' and p.suffix.lower() == '.mp3')
    candidates = {}
    sources_by_path = {}
    entries = []
    for path in files:
        paper_id = explicit_identity(path)
        entry = AudioMapping(source=str(path), paper_id=paper_id)
        entries.append(entry)
        targets = [paper_id] if paper_id else []
        proof = proofs_by_source.get(str(path.resolve()))
        if not paper_id and proof:
            try:
                targets = verified_targets(path, proof, paper_ids)
                entry.verification = proof
                entry.paper_id = targets[0]
            except ValueError as error:
                entry.reason = str(error)
                continue
        if not targets:
            entry.reason = '文件名未明确标注试卷套号，未猜测对应关系。'
        elif any(target not in paper_ids for target in targets):
            entry.reason = '未找到对应的内置真题。'
        else:
            entry.paper_ids = targets
            sources_by_path[path] = entry
            for target in targets:
                candidates.setdefault(target, []).append(path)
    destination = APP / 'src/static/audio'
    destination.mkdir(parents=True, exist_ok=True)
    mappings = {}
    for path, entry in sources_by_path.items():
        if any(len(candidates[target]) != 1 for target in entry.paper_ids):
            entry.reason = '同一套试卷匹配到多份音频，未自动选择。'
            continue
        extension = actual_extension(path)
        if not extension:
            entry.reason = '未识别音频容器格式。'
            continue
        with path.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        filename = entry.paper_ids[0] + extension
        target = destination / filename
        if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != digest:
            shutil.copyfile(path, target)
        entry.asset = AudioAsset(src=f'/static/audio/{filename}', sha256=digest, bytes=path.stat().st_size)
        for target in entry.paper_ids:
            mappings[target] = entry.asset.model_dump()
    # New sources are admitted only after content review and question/file hash checks.
    for record in additions.recordings:
        if record.paper_id in mappings:
            raise ValueError(f'网络录音试图覆盖已接入的原始录音：{record.paper_id}')
        filename = 'web-' + record.paper_id + record.container
        target = destination / filename
        if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != record.sha256:
            shutil.copyfile(record.source, target)
        asset = AudioAsset(src=f'/static/audio/{filename}', sha256=record.sha256, bytes=target.stat().st_size)
        mappings[record.paper_id] = asset.model_dump()
        entries.append(AudioMapping(source=record.source, paper_id=record.paper_id, paper_ids=[record.paper_id], asset=asset, review_source=record.source_page))
    # Aliases reuse the same physical asset and never copy or reorder questions.
    for record in additions.shared_recordings:
        if record.reference_paper_id not in mappings:
            raise ValueError(f'录音复用关系冲突或缺少已核对录音：{record.paper_id}')
        if record.paper_id in mappings and mappings[record.paper_id]['sha256'] != mappings[record.reference_paper_id]['sha256']:
            raise ValueError(f'录音复用关系试图覆盖另一份录音：{record.paper_id}')
        mappings[record.paper_id] = dict(mappings[record.reference_paper_id])
    (APP / 'src/data/audio.json').write_text(json.dumps(mappings, ensure_ascii=False, indent=2), encoding='utf-8')
    report = AudioReport(discovered=len(files) + len(additions.recordings), mapped=len(mappings), packaged_recordings=sum(item.asset is not None for item in entries), total_bytes=sum(item.asset.bytes for item in entries if item.asset), files=entries)
    (WORKSPACE / 'work/app-audio-report.json').write_text(report.model_dump_json(indent=2), encoding='utf-8')
    print(f'Audio: {report.packaged_recordings}/{report.discovered} recordings; {report.mapped} papers; {report.total_bytes / 1024 ** 2:.1f} MiB')


if __name__ == '__main__':
    main()
