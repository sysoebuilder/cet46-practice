"""Package the workspace's completed Pydantic papers as built-in app assets.

This is a development build step, not an end-user external-library import feature.
Original parser outputs and Markdown files remain read-only.
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

APP = Path(__file__).resolve().parents[1]
WORKSPACE = Path('E:/四六级真题')
sys.path.insert(0, str(WORKSPACE / "cet_parser"))
from cet_parser.models import Availability, BatchReport, Diagnostic, ExamPaper
from cet_parser.answer_models import AnswerDiagnostic, AnswerDocument, ReferenceMaterial
from question_supplements import read_copies, validate_copies, copy_sections


class PackagedAnswer(BaseModel):
    answer: str
    explanation: str | None = None


class PackagedSolutions(BaseModel):
    origin: Literal['answer_pdf', 'question_inference', 'audio_model', 'external_reference'] | None = None
    items: dict[str, PackagedAnswer] = Field(default_factory=dict)
    references: dict[str, list[ReferenceMaterial]] = Field(default_factory=dict)


class LibraryEntry(BaseModel):
    paper_id: str
    source: str
    parser_status: str
    missing_sections: list[str] = Field(default_factory=list)
    diagnostics: list[Diagnostic] = Field(default_factory=list)
    answer_source: str | None = None
    answer_origin: str | None = None
    answer_reference_url: str | None = None
    objective_count: int = 0
    answer_count: int = 0
    explanation_count: int = 0
    reference_count: int = 0
    excluded_answers: list[int] = Field(default_factory=list)
    answer_text_mismatches: list[int] = Field(default_factory=list)
    answer_diagnostics: list[AnswerDiagnostic] = Field(default_factory=list)
    listening_reference: str | None = None


class LibraryReport(BaseModel):
    total: int
    counts_by_level: dict[str, int]
    missing_by_section: dict[str, int]
    answer_documents: int = 0
    usable_answers: int = 0
    papers_with_answers: int = 0
    answers_by_origin: dict[str, int] = Field(default_factory=dict)
    usable_explanations: int = 0
    objective_questions_without_answers: int = 0
    reference_materials: int = 0
    papers: list[LibraryEntry]


def compact(value):
    if isinstance(value, dict):
        return {key: compact(item) for key, item in value.items() if key not in {"source", "raw_markdown"}}
    if isinstance(value, list):
        return [compact(item) for item in value]
    return value


def missing_sections(paper):
    result = []
    for name, section in [("writing", paper.writing), ("translation", paper.translation)]:
        if section.availability != Availability.AVAILABLE or not section.tasks:
            result.append(name)
    if paper.listening.availability != Availability.AVAILABLE or not any(
        group.questions
        for section in paper.listening.sections if section.availability == Availability.AVAILABLE
        for group in section.groups
    ):
        result.append("listening")
    for name, section in [
        ("cloze", paper.reading.word_bank_cloze),
        ("matching", paper.reading.paragraph_matching),
        ("reading", paper.reading.passage_comprehension),
    ]:
        if paper.reading.availability != Availability.AVAILABLE or section is None or section.availability != Availability.AVAILABLE:
            result.append(name)
        elif not (any(p.questions for p in section.passages) if name == "reading" else section.questions):
            result.append(name)
    return result


def objective_options(paper):
    """Index the real questions; absent sections cannot gain questions from an answer key."""
    result = {}
    def add(questions, kind, section, shared=None):
        for question in questions:
            options = shared if shared is not None else question.options
            result[question.number] = (kind, section, {o.label: o.text for o in options})
    if paper.listening.availability == Availability.AVAILABLE:
        for section in paper.listening.sections:
            if section.availability == Availability.AVAILABLE:
                for group in section.groups:
                    add(group.questions, 'option', 'listening')
    if paper.reading.availability == Availability.AVAILABLE:
        cloze = paper.reading.word_bank_cloze
        if cloze and cloze.availability == Availability.AVAILABLE:
            add(cloze.questions, 'word_bank', 'reading', cloze.word_bank)
        matching = paper.reading.paragraph_matching
        if matching and matching.availability == Availability.AVAILABLE:
            add(matching.questions, 'paragraph', 'reading', matching.paragraphs)
        comprehension = paper.reading.passage_comprehension
        if comprehension and comprehension.availability == Availability.AVAILABLE:
            for passage in comprehension.passages:
                add(passage.questions, 'option', 'reading')
    return result


def clean_explanation(answer):
    """An answer-table row contains a key, not an explanation."""
    explanation = (answer.explanation or '').strip()
    key_row = rf'\|\s*{answer.number}\s*\|\s*{re.escape(answer.answer)}\s*\|'
    return None if not explanation or re.fullmatch(key_row, explanation) else explanation


def package_solutions(paper, path, entry):
    solutions = PackagedSolutions()
    options = objective_options(paper)
    entry.objective_count = len(options)
    if not path.exists():
        return solutions
    entry.answer_source = str(path)
    try:
        document = AnswerDocument.model_validate_json(path.read_text(encoding='utf-8-sig'))
    except (ValueError, OSError) as error:
        entry.answer_diagnostics.append(AnswerDiagnostic(severity='error', code='answer_document_invalid', location='answers', message=str(error)))
        return solutions
    entry.answer_diagnostics.extend(document.diagnostics)
    identity = lambda p: (p.level.value, p.year, p.month, p.set_number)
    if identity(paper) != identity(document):
        entry.answer_diagnostics.append(AnswerDiagnostic(severity='error', code='answer_identity_mismatch', location='answers', message='答案所属级别、年月或套号与试卷不一致，未接入。'))
        return solutions
    if any(d.severity == 'error' for d in document.diagnostics):
        return solutions
    solutions.origin = document.source.origin
    entry.answer_origin = document.source.origin
    entry.answer_reference_url = document.source.reference_url
    blocked = set()
    for diagnostic in document.diagnostics:
        match = re.fullmatch(r'question\.(\d+)', diagnostic.location)
        if match and diagnostic.severity in {'warning', 'error'}:
            blocked.add(int(match.group(1)))
    duplicates = Counter(item.number for item in document.answers)
    for answer in document.answers:
        actual = options.get(answer.number)
        if not actual:
            entry.excluded_answers.append(answer.number)
            continue
        kind, section, labels = actual
        if answer.number in blocked or duplicates[answer.number] != 1 or answer.kind.value != kind or answer.section.value != section or answer.answer not in labels:
            entry.excluded_answers.append(answer.number)
            if answer.number not in blocked:
                entry.answer_diagnostics.append(AnswerDiagnostic(code='answer_question_mismatch', location=f'question.{answer.number}', message='答案重复、题型不符或字母不在本题选项中，未接入。'))
            continue
        if answer.answer_text and answer.answer_text != labels[answer.answer]:
            entry.answer_text_mismatches.append(answer.number)
        # The correct option text is resolved from the original question by the app.
        solutions.items[str(answer.number)] = PackagedAnswer(answer=answer.answer, explanation=clean_explanation(answer))
    for reference in document.reference_materials:
        original = paper.writing if reference.kind == 'writing' else paper.translation
        if original.availability == Availability.AVAILABLE and original.tasks:
            solutions.references.setdefault(reference.kind, []).append(reference)
    entry.answer_count = len(solutions.items)
    entry.explanation_count = sum(bool(item.explanation) for item in solutions.items.values())
    entry.reference_count = sum(len(items) for items in solutions.references.values())
    return solutions


def main():
    source_dir = WORKSPACE / "解析结果"
    batch = BatchReport.model_validate_json((source_dir / "解析报告.json").read_text(encoding="utf-8-sig"))
    entries = {Path(item.output).resolve(): item for item in batch.files if item.output}
    sources = sorted(source_dir.rglob("真题.json"))
    if not sources or batch.failed or len(sources) != len(entries):
        raise RuntimeError("解析文件与报告不一致或仍有失败文件，未更新内置题库。")
    payloads = {}
    catalog = []
    report_entries = []
    original = {}
    # Validate the entire batch before writing any app asset.
    for path in sources:
        item = entries[path.resolve()]
        if item.status == "failed" or any(d.severity == "error" for d in item.diagnostics):
            raise RuntimeError(f"试卷存在解析错误：{path}")
        paper = ExamPaper.model_validate_json(path.read_text(encoding="utf-8-sig"))
        paper_id = f"{paper.level.value}-{paper.year}-{paper.month:02}-{paper.set_number}"
        if paper_id in payloads:
            raise RuntimeError(f"试卷 ID 重复：{paper_id}")
        data = compact(paper.model_dump(mode="json", by_alias=True))
        data["id"] = paper_id
        entry = LibraryEntry(paper_id=paper_id, source=str(path), parser_status=item.status,
            missing_sections=missing_sections(paper), diagnostics=item.diagnostics)
        data['solutions'] = package_solutions(paper, path.with_name('答案.json'), entry).model_dump(mode='json')
        original[paper_id] = json.loads(json.dumps(data))
        payloads[paper_id] = data
        catalog.append({key: data[key] for key in ["id", "year", "month", "level", "set_number"]})
        report_entries.append(entry)
    supplements = read_copies(APP)
    validate_copies(supplements, original)
    copy_sections(supplements, payloads)
    by_id = {entry.paper_id: entry for entry in report_entries}
    for copy in supplements.listening:
        entry = by_id[copy.paper_id]
        entry.listening_reference = copy.reference_paper_id
        entry.missing_sections = [s for s in entry.missing_sections if s != 'listening']
        entry.objective_count += 25
        items = payloads[copy.paper_id]['solutions']['items']
        entry.answer_count = len(items)
        entry.explanation_count = sum(bool(item['explanation']) for item in items.values())
    catalog.sort(key=lambda p: (-p["year"], -p["month"], p["level"], p["set_number"]))
    origin_counts = Counter()
    for item in report_entries:
        if item.answer_origin:
            origin_counts[item.answer_origin] += item.answer_count
    report = LibraryReport(total=len(catalog), counts_by_level=dict(Counter(p["level"] for p in catalog)),
        missing_by_section=dict(Counter(s for item in report_entries for s in item.missing_sections)),
        answer_documents=sum(item.answer_source is not None for item in report_entries),
        usable_answers=sum(item.answer_count for item in report_entries),
        papers_with_answers=sum(item.answer_count > 0 for item in report_entries),
        answers_by_origin=dict(origin_counts),
        usable_explanations=sum(item.explanation_count for item in report_entries),
        objective_questions_without_answers=sum(item.objective_count - item.answer_count for item in report_entries),
        reference_materials=sum(item.reference_count for item in report_entries), papers=report_entries)
    destination = APP / "src" / "static" / "papers"
    destination.mkdir(parents=True, exist_ok=True)
    for paper_id, data in payloads.items():
        (destination / f"{paper_id}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    (APP / "src" / "data" / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    (WORKSPACE / "work" / "app-library-report.json").write_text(report.model_dump_json(indent=2), encoding="utf-8")
    print(f"Packaged {report.total} papers: {report.counts_by_level}; missing: {report.missing_by_section}")
    print(f"Answer documents: {report.answer_documents}; usable answers: {report.usable_answers}")
    print(f"Papers with answers: {report.papers_with_answers}; origins: {report.answers_by_origin}; explanations: {report.usable_explanations}; references: {report.reference_materials}")


if __name__ == "__main__":
    main()
