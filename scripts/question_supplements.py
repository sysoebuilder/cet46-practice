"""User-approved same-session listening copies, independent of original Markdown."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field


class ListeningCopy(BaseModel):
    paper_id: str = Field(pattern=r'^CET[46]-20\d{2}-\d{2}-[123]$')
    reference_paper_id: str = Field(pattern=r'^CET[46]-20\d{2}-\d{2}-[123]$')
    basis: Literal['user_authorized_same_session_copy'] = 'user_authorized_same_session_copy'
    source_pdf: str
    source_pdf_sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    source_page: int = Field(ge=1)
    original_listening_sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    reference_listening_sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    reason: str


class QuestionSupplements(BaseModel):
    schema_version: Literal[1] = 1
    listening: list[ListeningCopy] = Field(default_factory=list)


def section_digest(section):
    return hashlib.sha256(json.dumps(section, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def read_copies(app):
    path = Path(app) / 'scripts/question_supplements.json'
    return QuestionSupplements.model_validate_json(path.read_text(encoding='utf-8')) if path.exists() else QuestionSupplements()


def validate_copies(catalog, original):
    seen = set()
    for record in catalog.listening:
        if record.paper_id in seen or record.paper_id == record.reference_paper_id:
            raise ValueError('重复或无效的听力补题记录。')
        seen.add(record.paper_id)
        if record.paper_id.rsplit('-', 1)[0] != record.reference_paper_id.rsplit('-', 1)[0]:
            raise ValueError('只能复制同级别、同年月的听力题目。')
        target = original[record.paper_id]['Listening']
        reference = original[record.reference_paper_id]['Listening']
        if target['availability'] == 'available' or reference['availability'] != 'available':
            raise ValueError('不能覆盖已有听力题目，也不能从缺题试卷复制。')
        if section_digest(target) != record.original_listening_sha256 or section_digest(reference) != record.reference_listening_sha256:
            raise ValueError('原卷或参考卷听力结构已变化，需要重新核对。')
        items = [q for s in reference['sections'] for g in s['groups'] for q in g['questions']]
        if [q['number'] for q in items] != list(range(1, 26)) or any(len(q['options']) != 4 for q in items):
            raise ValueError('参考卷未包含完整的 25 道听力题及选项。')
        with Path(record.source_pdf).open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != record.source_pdf_sha256:
                raise ValueError('核对的源 PDF 已变化。')


def copy_sections(catalog, payloads):
    """Copy only Listening and its matching keys; preserve all other section data."""
    for record in catalog.listening:
        target, reference = payloads[record.paper_id], payloads[record.reference_paper_id]
        target['Listening'] = json.loads(json.dumps(reference['Listening']))
        target_keys = target['solutions']['items']
        for number in range(1, 26):
            key = str(number)
            target_keys.pop(key, None)
            if key in reference['solutions']['items']:
                target_keys[key] = json.loads(json.dumps(reference['solutions']['items'][key]))
