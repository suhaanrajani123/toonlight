# portraits.py — draw the cast-bar pictures for every character that has a model.
#
# The site shows these still pictures in the cast bar instead of downloading every model
# on the first visit. Run it again whenever you change a model in docs/models/.
#
#   pip install playwright && playwright install chromium
#   python -m http.server 8765 --directory docs      (in another terminal)
#   python tools/portraits.py
#
# Saves docs/models/portraits/<id>.png for each docs/models/<id>.vrm (or .glb).

import base64, glob, os
from playwright.sync_api import sync_playwright

SIZE = 256  # pixels; the buttons show them at about 64-80 px, so this stays sharp on any screen
os.makedirs('docs/models/portraits', exist_ok=True)
models = sorted(glob.glob('docs/models/*.vrm') + glob.glob('docs/models/*.glb'))

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 400, 'height': 500})
    for path in models:
        cid = os.path.splitext(os.path.basename(path))[0]
        page.goto(f'http://localhost:8765/dev/preview.html?model=../models/{os.path.basename(path)}')
        page.wait_for_function('window.__ready', timeout=120000)
        page.wait_for_timeout(2500)  # let hair and clothes settle
        url = page.evaluate(f"import('../js/stage.js').then((m) => m.portrait(window.__rig, {SIZE}))")
        out = f'docs/models/portraits/{cid}.png'
        open(out, 'wb').write(base64.b64decode(url.split(',', 1)[1]))
        print('saved', out)
    browser.close()
