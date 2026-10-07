from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import re
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]


class Document(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.files = []
        self.references = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        self.files.extend(attrs[key] for key in ('src', 'href') if key in attrs)
        for key in ('for', 'aria-labelledby', 'aria-describedby'):
            self.references.update(attrs.get(key, '').split())


def local_file(reference, owner):
    url = urlsplit(reference.strip())
    if url.scheme or url.netloc or not url.path:
        return None
    path = (owner.parent / unquote(url.path)).resolve()
    assert path.is_relative_to(ROOT), f'{owner.name}: reference leaves site/: {reference}'
    assert path.is_file(), f'{owner.name}: missing file: {reference}'
    return path


doc = Document()
doc.feed((ROOT / 'index.html').read_text(encoding='utf-8'))
duplicates = [name for name, count in Counter(doc.ids).items() if count > 1]
assert not duplicates, f'Duplicate HTML IDs: {duplicates}'
ids = set(doc.ids)
references = set(doc.references)
app = (ROOT / 'app.mjs').read_text(encoding='utf-8')
references.update('cj-' + name for name in re.findall(r"""\bfind\(\s*['"]([^'"]+)['"]\s*\)""", app))
for name in ('app.mjs', 'balance-editor.mjs'):
    code = (ROOT / name).read_text(encoding='utf-8')
    references.update(re.findall(r"""\bgetElementById\(\s*['"]([^'"]+)['"]\s*\)""", code))
    references.update(re.findall(r"""\$\(\s*['"]([^'"]+)['"]\s*\)""", code))
    references.update(re.findall(r"""\bquerySelector\(\s*['"]#([\w-]+)['"]\s*\)""", code))
assert not references - ids, f'Missing DOM IDs: {sorted(references - ids)}'

files = set()
for reference in doc.files:
    path = local_file(reference, ROOT / 'index.html')
    if path:
        files.add(path)
    if reference.startswith('#'):
        assert reference[1:] in ids, f'Missing HTML anchor: {reference}'
for owner in ROOT.glob('*.css'):
    code = owner.read_text(encoding='utf-8')
    for reference in re.findall(r"""url\(\s*['"]?([^'")]+)['"]?\s*\)""", code):
        path = local_file(reference, owner)
        if path:
            files.add(path)
for owner in ROOT.glob('*.mjs'):
    code = owner.read_text(encoding='utf-8')
    imports = re.findall(r"""(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]""", code, re.MULTILINE)
    resources = re.findall(r"""\bnew\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)""", code)
    for reference in imports + resources:
        path = local_file(reference, owner)
        if path:
            files.add(path)


def verify_png(path):
    data = path.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', f'{path.name}: invalid PNG signature'
    offset, image_data, header, ended = 8, bytearray(), None, False
    while offset < len(data):
        assert offset + 12 <= len(data), f'{path.name}: truncated chunk'
        size = struct.unpack_from('>I', data, offset)[0]
        kind = data[offset + 4:offset + 8]
        end = offset + 12 + size
        assert end <= len(data), f'{path.name}: truncated {kind!r}'
        payload = data[offset + 8:offset + 8 + size]
        crc = struct.unpack_from('>I', data, offset + 8 + size)[0]
        assert zlib.crc32(kind + payload) == crc, f'{path.name}: corrupt {kind!r}'
        if offset == 8:
            assert kind == b'IHDR' and size == 13, f'{path.name}: missing IHDR'
            header = struct.unpack('>IIBBBBB', payload)
            assert header[0] > 0 and header[1] > 0, f'{path.name}: invalid dimensions'
        if kind == b'IDAT':
            image_data.extend(payload)
        if kind == b'IEND':
            assert size == 0 and end == len(data), f'{path.name}: invalid IEND'
            ended = True
            break
        offset = end
    assert header and ended and image_data, f'{path.name}: incomplete PNG'
    pixels = zlib.decompress(image_data)
    assert pixels, f'{path.name}: empty image data'
    width, height, depth, color, compression, filtering, interlace = header
    if depth == 8 and color in (2, 6) and interlace == 0:
        stride = 1 + width * (3 if color == 2 else 4)
        assert len(pixels) == height * stride, f'{path.name}: invalid scanline size'
        assert all(pixels[row * stride] <= 4 for row in range(height)), f'{path.name}: invalid filter'


for name in ('room', 'target', 'decoy'):
    verify_png(ROOT / 'assets' / f'{name}.png')
print(f'UI verified: {len(ids)} unique IDs, {len(references)} DOM references, {len(files)} local files, 3 valid PNGs.')
