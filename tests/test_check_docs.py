"""검사기의 양성/음성 사례만 확인하며 서비스 구현 테스트는 아닙니다."""

import tempfile
import unittest
from pathlib import Path

from scripts.check_docs import check


class CheckDocsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "docs").mkdir()
        (self.root / "examples").mkdir()

    def write(self, name, content):
        (self.root / name).write_text(content, encoding="utf-8")

    def test_valid_relative_links_and_json(self):
        self.write("README.md", "[문서](docs/guide.md#heading) [웹](https://example.com)")
        self.write("docs/guide.md", "[처음](../README.md) [자체](#heading)")
        self.write("examples/valid.json", '{"seed": 1}')
        self.assertEqual(check(self.root), ([], 2, 1))

    def test_missing_file(self):
        self.write("README.md", "[없음](docs/missing.md)")
        self.assertEqual(len(check(self.root)[0]), 1)

    def test_package_readme_and_public_json_without_dependencies(self):
        (self.root / "web" / "public").mkdir(parents=True)
        (self.root / "web" / "node_modules").mkdir()
        self.write("web/README.md", "[없음](missing.md)")
        self.write("web/public/runtime.json", "{")
        self.write("web/node_modules/README.md", "[검사 제외](missing.md)")
        errors, markdown_count, json_count = check(self.root)
        self.assertEqual((len(errors), markdown_count, json_count), (2, 1, 1))

    def test_invalid_json_and_nonfinite_constant(self):
        self.write("examples/invalid.json", "{")
        self.write("examples/nonfinite.json", '{"x": NaN}')
        self.assertEqual(len(check(self.root)[0]), 2)

    def test_escaped_space_and_code_not_checked(self):
        self.write("docs/a b.md", "# 문서")
        self.write("README.md", '[문서](docs/a%20b.md) [문서](<docs/a b.md>)\n'
                   '`[예시](missing.md)`\n```md\n[예시](missing.md)\n```')
        self.assertEqual(check(self.root)[0], [])

    def test_outside_repository(self):
        self.write("README.md", "[밖](../outside.md)")
        self.assertEqual(len(check(self.root)[0]), 1)


if __name__ == "__main__":
    unittest.main()
