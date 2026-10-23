"""Import safeguards; fixtures remain temporary and are never shipped as answers."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP / 'scripts'))
from package_library import LibraryEntry, package_solutions, WORKSPACE
from cet_parser.models import ExamPaper


class AnswerPackagingTests(unittest.TestCase):
    def setUp(self):
        source = WORKSPACE / '解析结果' / '六级' / '2017.06' / '第2套'
        self.paper = ExamPaper.model_validate_json((source / '真题.json').read_text(encoding='utf-8'))
        self.document = json.loads((source / '答案.json').read_text(encoding='utf-8'))
        self.document['diagnostics'] = []
        self.document['answers'] = [a for a in self.document['answers'] if a['number'] == 46]
        self.temporary = tempfile.TemporaryDirectory(dir=WORKSPACE / 'work')
        self.path = Path(self.temporary.name) / 'answers.json'
        self.entry = LibraryEntry(paper_id='CET6-2017-06-2', source='test', parser_status='ok')

    def tearDown(self):
        self.temporary.cleanup()

    def package(self):
        self.path.write_text(json.dumps(self.document, ensure_ascii=False), encoding='utf-8')
        return package_solutions(self.paper, self.path, self.entry)

    def test_keeps_label_and_explanation_but_not_mismatched_answer_text(self):
        self.document['answers'][0]['answer_text'] = 'Incorrect word-bank text'
        result = self.package()
        self.assertIn('46', result.items)
        self.assertEqual(result.items['46'].answer, self.document['answers'][0]['answer'])
        self.assertEqual(self.entry.answer_text_mismatches, [46])
        self.assertNotIn('answer_text', result.model_dump_json())

    def test_conflicting_answer_is_excluded_without_discarding_other_content(self):
        self.document['diagnostics'] = [{'severity': 'warning', 'code': 'answer_conflict', 'location': 'question.46', 'message': 'Test conflict'}]
        result = self.package()
        self.assertNotIn('46', result.items)
        self.assertEqual(self.entry.excluded_answers, [46])

    def test_wrong_paper_identity_is_not_loaded(self):
        self.document['set_number'] = 1
        self.assertFalse(self.package().items)
        self.assertEqual(self.entry.answer_diagnostics[-1].code, 'answer_identity_mismatch')

    def test_invalid_option_and_duplicate_question_are_not_loaded(self):
        self.document['answers'][0]['answer'] = 'O'
        self.assertFalse(self.package().items)
        self.document['answers'][0]['answer'] = 'A'
        self.document['answers'] *= 2
        self.assertFalse(self.package().items)

    def test_answer_key_does_not_restore_absent_original_questions(self):
        self.paper.reading.availability = 'source_omitted'
        self.assertFalse(self.package().items)

    def test_answer_table_alone_is_not_an_explanation(self):
        answer = self.document['answers'][0]
        answer['explanation'] = f"| {answer['number']} | {answer['answer']} |"
        result = self.package()
        self.assertIn('46', result.items)
        self.assertIsNone(result.items['46'].explanation)
        self.assertEqual(self.entry.answer_count, 1)
        self.assertEqual(self.entry.explanation_count, 0)

    def test_keeps_actual_explanation_after_answer_table(self):
        answer = self.document['answers'][0]
        answer['explanation'] = f"| {answer['number']} | {answer['answer']} |\n说明：来自题目原文。"
        self.assertEqual(self.package().items['46'].explanation, answer['explanation'])

    def test_generated_answers_keep_origin_for_reference_only_display(self):
        self.document['source']['origin'] = 'question_inference'
        self.document['source']['extractor'] = 'generated_markdown'
        self.document['source']['pdf_path'] = None
        result = self.package()
        self.assertIn('46', result.items)
        self.assertEqual(result.origin, 'question_inference')
        self.assertEqual(self.entry.answer_origin, 'question_inference')


if __name__ == '__main__':
    unittest.main()
