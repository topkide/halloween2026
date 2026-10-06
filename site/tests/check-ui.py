from pathlib import Path
from html.parser import HTMLParser
import re
root=Path(__file__).resolve().parents[1]
class Document(HTMLParser):
 def __init__(self): super().__init__();self.ids=[];self.files=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if 'id' in a:self.ids.append(a['id'])
  for k in ['src','href']:
   if k in a and not a[k].startswith(('data:','http','#')):self.files.append(a[k])
doc=Document();doc.feed((root/'index.html').read_text())
assert len(doc.ids)==len(set(doc.ids)), 'Duplicate HTML IDs'
refs=set()
for file in ['app.mjs','balance-editor.mjs']:
 code=(root/file).read_text()
 refs.update(re.findall(r"\$\('([^']+)'\)",code))
assert not refs-set(doc.ids), refs-set(doc.ids)
for path in doc.files: assert (root/path).is_file(),path
for path in re.findall(r"url\(['\"]?([^)'\"]+)",(root/'style.css').read_text()):
 if not path.startswith('data:'):assert (root/path).is_file(),path
for name in ['textbook','slippers','basketball','badminton','backpack','football','pencilcase','recorder','homework','bomb','talisman']:
 assert (root/f'assets/{name}.png').read_bytes().startswith(b'\x89PNG\r\n\x1a\n'),name
print(f'UI references verified: {len(doc.ids)} unique IDs, {len(doc.files)} file references, all 9 collection images.')
