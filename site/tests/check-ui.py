from pathlib import Path
from html.parser import HTMLParser
from collections import Counter
import re
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[1]
class Document(HTMLParser):
    def __init__(self):
        super().__init__();self.ids=[];self.files=[];self.refs=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:self.ids.append(a['id'])
        for key in ['src','href']:
            if key in a:self.files.append(a[key])
        for key in ['aria-labelledby','aria-describedby','for']:self.refs.extend(a.get(key,'').split())
doc=Document();doc.feed((ROOT/'index.html').read_text())
assert not [k for k,v in Counter(doc.ids).items() if v>1]
ids=set(doc.ids)
app=(ROOT/'app.mjs').read_text()
refs=set(doc.refs)|set(re.findall(r"\$\(['\"]([^'\"]+)",app))|set(re.findall(r"ui\[['\"]([^'\"]+)['\"]\]",app))|set(re.findall(r'ui\.([a-zA-Z][\w-]*)',app))
assert not refs-ids, f'Missing IDs: {refs-ids}'
files=doc.files[:]
for owner in ROOT.glob('*.mjs'):
    files+=re.findall(r"\bfrom\s+['\"]([^'\"]+)",owner.read_text())
for f in files:
    url=urlsplit(f)
    if not url.scheme and url.path:assert (ROOT/url.path).is_file(),f'Missing local file: {f}'
assert 'type="module"' in (ROOT/'index.html').read_text()
print(f'UI verified: {len(ids)} unique IDs and all local module/asset references.')
