"""작은 저장소의 상대 파일 링크와 JSON 문법을 검사합니다.

표준 inline Markdown 링크만 검사합니다. 외부 URL/heading anchor 검증이나
전체 Markdown parser를 대신하지 않습니다. 앱·센서·학습 품질 검사가 아닙니다.
"""

import json
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit


LINK = re.compile(r"!?(?:\[[^\]\n]*\])\(([^)\n]+)\)")


def reject_constant(value):
    raise ValueError(f"JSON 유한값이 아님: {value}")


def check(root):
    errors = []
    markdown_count = 0
    json_count = 0
    # ponytail: 관리하는 문서 폴더만 순회; 앱 검증은 해당 스택 CI에서 추가합니다.
    markdown_paths = list(root.glob("*.md"))
    for directory in ("docs", "examples", ".github"):
        markdown_paths.extend((root / directory).rglob("*.md"))
    # 패키지 설명서는 검사하되 node_modules/dist는 순회하지 않습니다.
    for directory in ("web", "engine"):
        markdown_paths.extend((root / directory).glob("*.md"))
    for path in markdown_paths:
        markdown_count += 1
        source = path.read_text(encoding="utf-8")
        source = re.sub(r"```.*?```", "", source, flags=re.S)
        source = re.sub(r"`[^`\n]*`", "", source)
        for raw in LINK.findall(source):
            target = raw.strip()
            if target.startswith("<") and ">" in target:
                target = target[1:target.index(">")]
            else:
                target = target.split()[0]
            parsed = urlsplit(target)
            if parsed.scheme or parsed.netloc or not parsed.path:
                continue
            resolved = (path.parent / unquote(parsed.path)).resolve()
            if not resolved.is_relative_to(root.resolve()):
                errors.append(f"{path.relative_to(root)}: 저장소 밖 링크: {target}")
            elif not resolved.exists():
                errors.append(f"{path.relative_to(root)}: 없는 파일: {target}")
    json_paths = list((root / "examples").rglob("*.json"))
    json_paths.extend((root / "web" / "public").glob("*.json"))
    for path in json_paths:
        json_count += 1
        try:
            json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_constant)
        except (ValueError, UnicodeError) as exc:
            errors.append(f"{path.relative_to(root)}: JSON 오류: {exc}")
    return errors, markdown_count, json_count


if __name__ == "__main__":
    errors, markdown_count, json_count = check(Path(__file__).resolve().parents[1])
    for error in errors:
        print(error)
    print(f"Markdown {markdown_count}개, JSON {json_count}개 검사: 오류 {len(errors)}개")
    raise SystemExit(bool(errors))
