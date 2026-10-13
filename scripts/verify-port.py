#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path
import sys
from port import expected, ROOT

files, excluded = expected()
manifest = json.loads((ROOT / 'provenance/manifest.json').read_text())
errors = []
for path, (original, ported) in files.items():
    target = ROOT / path
    if not target.exists() or target.read_bytes() != ported:
        errors.append(f'Unrecorded upstream change: {path}')
    recorded = manifest['files'].get(path, {})
    if recorded.get('upstream_sha256') != hashlib.sha256(original).hexdigest(): errors.append(f'Bad source hash: {path}')
    if recorded.get('ported_sha256') != hashlib.sha256(ported).hexdigest(): errors.append(f'Bad port hash: {path}')
if set(files) != set(manifest['files']) or excluded != manifest['excluded']: errors.append('Manifest scope differs')
for path in (ROOT / 'skills').rglob('SKILL.md'):
    text = path.read_text()
    if not text.startswith(f'---\nname: {path.parent.name}\n'): errors.append(f'Invalid skill name: {path}')
    if '\ndescription:' not in text: errors.append(f'Missing description: {path}')
    if '~/.cursor/' in text or 'environment: "cloud"' in text: errors.append(f'Unadapted Cursor host instruction: {path}')
if errors:
    print('\n'.join(errors)); sys.exit(1)
print(f'PASS: {len(files)} original/dependency files match the recorded minimal transformations, including adapted bodies.')
