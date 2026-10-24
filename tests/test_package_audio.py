import json
import sys
import tempfile
import unittest
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP / 'scripts'))
from package_audio import actual_extension, explicit_identity, VerifiedAudio, verified_targets, WORKSPACE
from listening_reviews import ListeningReview, load_paper, question_signature, validate_recording, validate_shared, reviewed_additions


class AudioPackagingTests(unittest.TestCase):
    def test_numeric_and_chinese_set_labels_map_exactly(self):
        self.assertEqual(explicit_identity(Path('E:/四六级题库/四级真题/2024.12/听力音频/2024年12月英语四级听力（第二套）.mp3')), 'CET4-2024-12-2')
        self.assertEqual(explicit_identity(Path('E:/四六级题库/六级真题/2023.06/听力音频/2023.06六级真题第1套听力音频.mp3')), 'CET6-2023-06-1')

    def test_lone_files_and_audio_track_numbers_are_not_guessed(self):
        for filename in ['2025年6月四级音频1.MP3', '2025年6月四级听力音频.mp3', '2025年6月四级真题（全1套）.mp3']:
            self.assertIsNone(explicit_identity(Path('E:/四六级题库/四级真题/2025.06/听力音频') / filename))

    def test_mislabeled_m4a_is_copied_with_its_real_format(self):
        with tempfile.TemporaryDirectory(dir=WORKSPACE / 'work') as temporary:
            path = Path(temporary) / 'wrong.mp3'
            path.write_bytes(b'\x00\x00\x00\x18ftypM4A ' + b'\x00' * 20)
            self.assertEqual(actual_extension(path), '.m4a')
            path.write_bytes(b'ID3' + b'\x00' * 20)
            self.assertEqual(actual_extension(path), '.mp3')

    def test_every_packaged_recording_exists_and_matches_its_format(self):
        catalog = json.loads((APP / 'src/data/audio.json').read_text(encoding='utf-8'))
        self.assertEqual(len(catalog), 119)
        self.assertEqual(len({asset['src'] for asset in catalog.values()}), 73)
        for asset in catalog.values():
            path = APP / 'src' / asset['src'].lstrip('/')
            self.assertEqual(path.stat().st_size, asset['bytes'])
            self.assertEqual(path.suffix, actual_extension(path))

    def test_reviewed_content_matches_are_bound_to_recordings_and_question_order(self):
        records = [VerifiedAudio.model_validate(item) for item in json.loads((APP / 'scripts/audio_verified_mappings.json').read_text(encoding='utf-8'))]
        catalog = json.loads((APP / 'src/data/catalog.json').read_text(encoding='utf-8'))
        ids = {paper['id'] for paper in catalog}
        self.assertEqual(len(records), 5)
        for record in records:
            self.assertEqual(verified_targets(Path(record.source), record, ids), record.paper_ids)
        wrong_audio = records[0].model_copy(update={'sha256': '0' * 64})
        with self.assertRaisesRegex(ValueError, '音频摘要'):
            verified_targets(Path(wrong_audio.source), wrong_audio, ids)
        wrong_questions = records[0].model_copy(update={'questions_sha256': '0' * 64})
        with self.assertRaisesRegex(ValueError, '选项顺序'):
            verified_targets(Path(wrong_questions.source), wrong_questions, ids)

    def test_shared_tracks_only_link_identical_sets_and_do_not_expand_to_other_sets(self):
        catalog = json.loads((APP / 'src/data/audio.json').read_text(encoding='utf-8'))
        for session in ['2022-06', '2022-09']:
            self.assertEqual(len({catalog[f'CET6-{session}-{number}']['src'] for number in [1, 2, 3]}), 1)
        for level, session in [('CET4', '2025-06'), ('CET6', '2025-06'), ('CET6', '2026-06')]:
            self.assertIn(f'{level}-{session}-1', catalog)
            self.assertIn(f'{level}-{session}-2', catalog)
            self.assertNotEqual(catalog[f'{level}-{session}-1']['src'], catalog[f'{level}-{session}-2']['src'])

    def test_new_recordings_pass_content_review_and_hash_checks(self):
        review = reviewed_additions(APP)
        self.assertEqual(len(review.recordings), 52)
        self.assertEqual(len(review.shared_recordings), 42)
        record = review.recordings[0]
        with self.assertRaisesRegex(ValueError, '摘要'):
            validate_recording(record.model_copy(update={'sha256': '0' * 64}), APP)
        with self.assertRaisesRegex(ValueError, '选项顺序'):
            validate_recording(record.model_copy(update={'questions_sha256': '0' * 64}), APP)
        with self.assertRaisesRegex(ValueError, '格式'):
            validate_recording(record.model_copy(update={'container': '.mp3'}), APP)

    def test_review_evidence_is_bound_to_real_printed_options(self):
        review = ListeningReview.model_validate_json((APP / 'scripts/web_audio_verified.json').read_text(encoding='utf-8'))
        record = review.recordings[0].model_copy(deep=True)
        record.evidence[0].option_text = 'This text does not occur in the paper.'
        with self.assertRaisesRegex(ValueError, '印刷题目'):
            validate_recording(record, APP)

    def test_shared_audio_never_copies_questions_or_crosses_sessions(self):
        review = ListeningReview.model_validate_json((APP / 'scripts/web_audio_verified.json').read_text(encoding='utf-8'))
        omitted = next(r for r in review.shared_recordings if r.paper_id == 'CET4-2025-06-3')
        validate_shared(omitted, APP)
        self.assertEqual(load_paper(APP, omitted.paper_id)['Listening'], load_paper(APP, omitted.reference_paper_id)['Listening'])
        with self.assertRaisesRegex(ValueError, '同年月'):
            validate_shared(omitted.model_copy(update={'reference_paper_id': 'CET4-2024-06-2'}), APP)
        with self.assertRaisesRegex(ValueError, '不一致'):
            validate_shared(omitted.model_copy(update={'reference_paper_id': 'CET4-2025-06-1'}), APP)
        identical = next(r for r in review.shared_recordings if r.basis == 'identical_printed_questions')
        with self.assertRaisesRegex(ValueError, '不一致'):
            validate_shared(identical.model_copy(update={'questions_sha256': '0' * 64}), APP)

    def test_every_available_listening_paper_has_audio_and_aliases_share_files(self):
        audio = json.loads((APP / 'src/data/audio.json').read_text(encoding='utf-8'))
        catalog = json.loads((APP / 'src/data/catalog.json').read_text(encoding='utf-8'))
        for metadata in catalog:
            paper = load_paper(APP, metadata['id'])
            if question_signature(paper):
                self.assertIn(metadata['id'], audio)
        review = ListeningReview.model_validate_json((APP / 'scripts/web_audio_verified.json').read_text(encoding='utf-8'))
        for alias in review.shared_recordings:
            self.assertEqual(audio[alias.paper_id], audio[alias.reference_paper_id])

    def test_reversed_web_set_labels_are_resolved_by_recording_content(self):
        review = ListeningReview.model_validate_json((APP / 'scripts/web_audio_verified.json').read_text(encoding='utf-8'))
        records = {r.paper_id: r for r in review.recordings}
        self.assertIn('/2019_12_2/', records['CET4-2019-12-1'].source_url)
        self.assertIn('/2019_12_1/', records['CET4-2019-12-2'].source_url)


if __name__ == '__main__':
    unittest.main()
