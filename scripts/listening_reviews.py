"""Validate reviewed web recordings and shared audio without copying question sets."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class SampleEvidence(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    quote: str = Field(min_length=1)
    question_number: int = Field(ge=1, le=25)
    option_label: Literal['A', 'B', 'C', 'D']
    option_text: str = Field(min_length=1)


class WebRecording(BaseModel):
    paper_id: str = Field(pattern=r'^CET[46]-20\d{2}-\d{2}-[123]$')
    source: str
    source_url: str
    source_page: str
    sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    questions_sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    duration_seconds: float = Field(gt=1200, lt=2400)
    container: Literal['.m4a', '.mp3']
    transcript_sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    evidence: list[SampleEvidence] = Field(min_length=2)

    @model_validator(mode='after')
    def distributed_evidence(self):
        if max(x.start for x in self.evidence) - min(x.start for x in self.evidence) < self.duration_seconds / 2:
            raise ValueError('核对证据必须覆盖录音前后不同位置。')
        if any(x.end <= x.start or x.end > self.duration_seconds + 2 for x in self.evidence):
            raise ValueError('录音证据时间范围无效。')
        return self


class SharedRecording(BaseModel):
    paper_id: str = Field(pattern=r'^CET[46]-20\d{2}-\d{2}-[123]$')
    reference_paper_id: str = Field(pattern=r'^CET[46]-20\d{2}-\d{2}-[123]$')
    basis: Literal['identical_printed_questions', 'explicit_source_notice']
    questions_sha256: str | None = None
    source: str | None = None
    notice: str | None = None
    omission_sha256: str | None = None


class ListeningReview(BaseModel):
    schema_version: Literal[1] = 1
    recordings: list[WebRecording] = Field(default_factory=list)
    shared_recordings: list[SharedRecording] = Field(default_factory=list)


def digest_file(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def questions(paper):
    section = paper['Listening']
    if section['availability'] != 'available':
        return []
    return [q for part in section['sections'] for group in part['groups'] for q in group['questions']]


def question_signature(paper):
    """Keep numbers, letters and the printed option order; stems aren't used to infer keys."""
    items = questions(paper)
    if [q['number'] for q in items] != list(range(1, 26)):
        return None
    value = [(q['number'], [(o['label'], o['text']) for o in q['options']]) for q in items]
    return hashlib.sha256(json.dumps(value, ensure_ascii=False).encode()).hexdigest()


def load_paper(app, paper_id):
    path = Path(app) / 'src/static/papers' / f'{paper_id}.json'
    paper = json.loads(path.read_text(encoding='utf-8'))
    actual = f"{paper['level']}-{paper['year']}-{paper['month']:02d}-{paper['set_number']}"
    if actual != paper_id:
        raise ValueError('试卷身份不匹配。')
    return paper


def validate_recording(record, app):
    paper = load_paper(app, record.paper_id)
    if question_signature(paper) != record.questions_sha256:
        raise ValueError('网络录音的题目或选项顺序已变化，需要重新核对。')
    source = Path(record.source)
    if digest_file(source) != record.sha256:
        raise ValueError('网络录音文件摘要与核对记录不一致。')
    with source.open('rb') as stream:
        header = stream.read(16)
    extension = '.m4a' if header[4:8] == b'ftyp' else '.mp3' if header.startswith(b'ID3') or (len(header) > 1 and header[0] == 255 and header[1] & 224 == 224) else None
    if extension != record.container:
        raise ValueError('录音容器格式不匹配。')
    by_number = {q['number']: q for q in questions(paper)}
    for evidence in record.evidence:
        item = by_number[evidence.question_number]
        if not any(o['label'] == evidence.option_label and o['text'] == evidence.option_text for o in item['options']):
            raise ValueError('录音核对证据与印刷题目不一致。')


def validate_shared(record, app):
    if record.paper_id == record.reference_paper_id or record.paper_id.rsplit('-', 1)[0] != record.reference_paper_id.rsplit('-', 1)[0]:
        raise ValueError('仅允许同级别同年月的试卷复用录音。')
    target = load_paper(app, record.paper_id)
    reference = load_paper(app, record.reference_paper_id)
    if record.basis == 'identical_printed_questions':
        signature = question_signature(target)
        if not signature or signature != record.questions_sha256 or signature != question_signature(reference):
            raise ValueError('共用录音的已印刷题目不一致。')
    else:
        # Only the recording is shared. The omitted questions remain omitted.
        if target['Listening']['availability'] == 'available':
            raise ValueError('已有听力题目的试卷不能使用缺题说明作匹配依据。')
        source = json.loads(Path(record.source or '').read_text(encoding='utf-8'))
        actual = f"{source['level']}-{source['year']}-{source['month']:02d}-{source['set_number']}"
        raw = source['Listening'].get('raw_markdown', '')
        if actual != record.paper_id or not record.notice or record.notice not in raw or hashlib.sha256(raw.encode()).hexdigest() != record.omission_sha256:
            raise ValueError('原卷缺题及录音共用说明已变化。')
        plain = re.sub(r'[\s*#]', '', raw)
        references = re.findall(r'(?:与|同)(?:第)([一二三123])套', plain)
        expected = int(record.reference_paper_id.rsplit('-', 1)[1])
        number = {'一': 1, '二': 2, '三': 3, '1': 1, '2': 2, '3': 3}
        if '或' in plain or not references or {number[x] for x in references} != {expected}:
            raise ValueError('原卷没有明确指定该套录音，不能猜配。')
        if not question_signature(reference):
            raise ValueError('共用录音的参考试卷缺题。')


def reviewed_additions(app):
    path = Path(app) / 'scripts/web_audio_verified.json'
    review = ListeningReview.model_validate_json(path.read_text(encoding='utf-8')) if path.exists() else ListeningReview()
    seen = set()
    for record in review.recordings:
        if record.paper_id in seen:
            raise ValueError('网络录音核对记录重复。')
        seen.add(record.paper_id)
        validate_recording(record, app)
    for record in review.shared_recordings:
        if record.paper_id in seen:
            raise ValueError('试卷录音复用关系重复。')
        seen.add(record.paper_id)
        validate_shared(record, app)
    return review
