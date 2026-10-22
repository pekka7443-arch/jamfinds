#!/bin/bash
# Inspect full mod object + test lowercase "vehicles" category.
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
curl -s --http1.1 --max-time 20 -X POST "https://beamfinds.com/api/mods/list" \
  -H "Content-Type: application/json" -A "$UA" \
  -d '{"page":1,"limit":1,"category":"Map","sort":"newest"}' > /home/z/my-project/scripts/bf-map-sample.json
python3 -c "
import json
d=json.load(open('/home/z/my-project/scripts/bf-map-sample.json'))
m=d['mods'][0]
for k,v in m.items():
    s=str(v)[:100].replace(chr(10),' ')
    print(f'{k:26s} {s}')"
echo '---'
curl -s --http1.1 --max-time 20 -X POST "https://beamfinds.com/api/mods/list" \
  -H "Content-Type: application/json" -A "$UA" \
  -d '{"page":1,"limit":3,"category":"vehicles","sort":"newest"}' > /home/z/my-project/scripts/bf-lower.json
python3 -c "
import json
d=json.load(open('/home/z/my-project/scripts/bf-lower.json'))
print('vehicles(lowercase) total:', d.get('total'), 'success:', d.get('success'))
for m in d.get('mods',[]):
    print(' -', m['id'], repr(m.get('category')), '|', m['name'][:50])"
