#!/bin/bash
# Probe BeamFinds /api/mods/list for all categories with their totals.
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
for CAT in "IRL Vehicle" "Fictional Vehicle" "Map" "Parts" "Config" "Sound Mod" "UI" "Other"; do
  RESP=$(curl -s --http1.1 --max-time 20 -X POST "https://beamfinds.com/api/mods/list" \
    -H "Content-Type: application/json" -A "$UA" \
    -d "{\"page\":1,\"limit\":1,\"category\":\"$CAT\",\"sort\":\"newest\"}")
  echo "$RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f'{\"$CAT\":20s} total={d.get(\"total\")} pages@12={d.get(\"totalPages\")}')"
done
# No category (all)
RESP=$(curl -s --http1.1 --max-time 20 -X POST "https://beamfinds.com/api/mods/list" \
  -H "Content-Type: application/json" -A "$UA" \
  -d '{"page":1,"limit":1,"sort":"newest"}')
echo "$RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f'{\"ALL\":20s} total={d.get(\"total\")} pages@12={d.get(\"totalPages\")}')"
