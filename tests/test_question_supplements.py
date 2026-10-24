import copy
import json
import sys
import unittest
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP / 'scripts'))
from question_supplements import read_copies, validate_copies, copy_sections
from package_library import compact, ExamPaper, WORKSPACE


class QuestionSupplementTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = read_copies(APP)
        cls.original = {}
        for path in (WORKSPACE / '解析结果').rglob('真题.json'):
            paper = ExamPaper.model_validate_json(path.read_text(encoding='utf-8-sig'))
            data = compact(paper.model_dump(mode='json', by_alias=True))
            pid = f'{paper.level.value}-{paper.year}-{paper.month:02d}-{paper.set_number}'
            cls.original[pid] = data

    def test_all_33_authorized_copies_match_original_sources_and_complete_reference_sets(self):
        self.assertEqual(len(self.catalog.listening), 33)
        validate_copies(self.catalog, self.original)

    def test_rejects_changed_pdf_changed_options_and_cross_session_copies(self):
        for field, value, message in [
            ('source_pdf_sha256', '0' * 64, 'PDF'),
            ('reference_listening_sha256', '0' * 64, '已变化'),
            ('reference_paper_id', 'CET4-2025-06-1', '同年月'),
        ]:
            catalog = self.catalog.model_copy(deep=True)
            setattr(catalog.listening[0], field, value)
            with self.assertRaisesRegex(ValueError, message):
                validate_copies(catalog, self.original)

    def test_copies_listening_with_its_keys_but_preserves_other_sections(self):
        payloads = {path.stem: json.loads(path.read_text(encoding='utf-8')) for path in (APP / 'src/static/papers').glob('*.json')}
        record = self.catalog.listening[0]
        payloads[record.paper_id]['Listening'] = copy.deepcopy(self.original[record.paper_id]['Listening'])
        payloads[record.paper_id]['solutions']['items']['1'] = {'answer': 'Z', 'explanation': 'stale key'}
        before = copy.deepcopy(payloads)
        copy_sections(self.catalog, payloads)
        for record in self.catalog.listening:
            target, reference = payloads[record.paper_id], payloads[record.reference_paper_id]
            self.assertEqual(target['Listening'], reference['Listening'])
            for name in ['Writing', 'Reading', 'Translation']:
                self.assertEqual(target[name], before[record.paper_id][name])
            for number in range(1, 26):
                key = str(number)
                self.assertEqual(target['solutions']['items'].get(key), reference['solutions']['items'].get(key))
            for number in range(26, 56):
                key = str(number)
                self.assertEqual(target['solutions']['items'].get(key), before[record.paper_id]['solutions']['items'].get(key))

    def test_cannot_overwrite_an_existing_original_listening_section(self):
        original = copy.deepcopy(self.original)
        record = self.catalog.listening[0]
        original[record.paper_id]['Listening'] = copy.deepcopy(original[record.reference_paper_id]['Listening'])
        with self.assertRaisesRegex(ValueError, '覆盖已有'):
            validate_copies(self.catalog, original)


if __name__ == '__main__':
    unittest.main()
