import json
from pathlib import Path

src = Path("scripts/_seat-layout.json")
data = json.loads(src.read_text(encoding="utf-8"))
out = Path("src/lib/seats/a320neo.json")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
print("wrote", out, "seats", len(data["seats"]))
