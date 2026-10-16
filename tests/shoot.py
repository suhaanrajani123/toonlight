# Screenshot characters from the dev preview page. Usage: python3 shoot.py seraphine [mood] [mouth] [turn]
import sys, subprocess, time, os
from playwright.sync_api import sync_playwright
out = os.environ.get('OUT', '/tmp/claude-0/-home-claude/3fe70163-cebc-57b3-9939-d7602cda3cd0/scratchpad/shots')
os.makedirs(out, exist_ok=True)
chars = sys.argv[1].split(',')
variants = sys.argv[2:] or ['neutral:0:0']
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 520, 'height': 620})
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    for c in chars:
        for v in variants:
            mood, mouth, turn = (v.split(':') + ['0', '0'])[:3]
            pg.goto(f'http://localhost:8765/dev/preview.html?c={c}&mood={mood}&mouth={mouth}&turn={turn}')
            pg.wait_for_function('window.__ready', timeout=15000)
            pg.wait_for_timeout(1500)
            f = f'{out}/{c}-{mood}-{mouth}-{turn}.png'
            pg.screenshot(path=f); print(f)
    for l in logs: print(l)
    b.close()
