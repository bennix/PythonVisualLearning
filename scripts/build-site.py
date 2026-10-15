from pathlib import Path
import json, shutil
root=Path(__file__).resolve().parent.parent
out=root/'_site'
if out.exists(): shutil.rmtree(out)
out.mkdir()
for name in ['index.html','landing.css','landing.js']: shutil.copy2(root/name,out/name)
shutil.copytree(root/'assets',out/'assets')
for lab in json.loads((root/'labs.json').read_text()):
    target=out/lab['folder'];target.mkdir()
    for name in ['index.html','使用说明.txt']:shutil.copy2(root/lab['folder']/name,target/name)
(out/'.nojekyll').touch()
print('Built landing page and 10 standalone labs into _site/')
