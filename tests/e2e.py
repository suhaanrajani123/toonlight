# End-to-end browser test of the whole site. Needs: docs served on :8765, tests/fake-server.mjs on :8787.
import os, sys
from playwright.sync_api import sync_playwright
OUT = '/tmp/claude-0/-home-claude/3fe70163-cebc-57b3-9939-d7602cda3cd0/scratchpad/e2e'
os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
fails = []
def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

def with_api(page, url):
    def handler(route):
        import re
        body = re.sub(r"API_URL: '[^']*'", f"API_URL: '{url}'", open('docs/js/config.js').read())
        route.fulfill(status=200, content_type='text/javascript', body=body)
    page.route('**/js/config.js', handler)

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    # ---- demo mode, desktop ----
    pg = b.new_page(viewport={'width': 1366, 'height': 800})
    pg.set_default_timeout(90000)  # CPU rendering in CI is slow
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and 'TUNNEL' not in m.text and errors.append(m.text))  # sandbox blocks Google Fonts
    with_api(pg, '')  # demo mode
    pg.goto('http://localhost:8765/')
    pg.wait_for_function('[...document.querySelectorAll("#cast .face")].every(e => e.style.backgroundImage)', timeout=90000)
    check(pg.locator('#cast button').count() == 6, 'six characters in the cast')
    check(pg.locator('#notice').is_visible() and 'Demo mode' in pg.inner_text('#notice'), 'demo-mode notice shown')
    check(pg.inner_text('#name') == 'Kaito Hayabusa', 'starts on Kaito')
    bgs = pg.eval_on_selector_all('#cast .face', 'els => els.filter(e => e.style.backgroundImage.includes("data:image")).length')
    check(bgs == 6, f'portraits rendered ({bgs}/6)')
    pg.screenshot(path=f'{OUT}/01-desktop-demo.png')
    pg.click('.suggest button >> nth=0')
    pg.wait_for_timeout(1200)
    check(pg.locator('.msg.user').count() == 1 and pg.locator('.msg.bot').count() == 2, 'demo reply arrives')
    pg.wait_for_timeout(400)
    pg.screenshot(path=f'{OUT}/02-demo-reply.png')
    for i, cid in enumerate(['raven', 'jun', 'elara', 'fennick', 'stella']):
        pg.click(f'#cast [data-id="{cid}"]', no_wait_after=True)
        pg.wait_for_timeout(1300)
        pg.screenshot(path=f'{OUT}/03-{cid}.png')
    check(pg.evaluate('location.hash') == '#stella', 'URL remembers the character')
    pg.reload(); pg.wait_for_timeout(5000)
    check(pg.inner_text('#name') == 'Stella Nova', 'reload keeps Stella')
    pg.click('#cast [data-id="kaito"]', no_wait_after=True); pg.wait_for_timeout(2500)
    check(pg.locator('.msg.user').count() == 1, 'Kaito chat history kept after reload')
    pg.click('#clear'); pg.wait_for_timeout(200)
    check(pg.locator('.msg.user').count() == 0 and pg.locator('.suggest button').count() == 3, 'clear chat works')
    check(not errors, f'no console errors in demo mode {errors[:3]}')
    pg.close()

    # ---- real API path (local worker + fake Gemini) ----
    pg = b.new_page(viewport={'width': 1366, 'height': 800})
    pg.set_default_timeout(90000)  # CPU rendering in CI is slow
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and 'TUNNEL' not in m.text and errors.append(m.text))  # sandbox blocks Google Fonts
    with_api(pg, 'http://localhost:8787/chat')
    pg.goto('http://localhost:8765/#raven')
    pg.wait_for_timeout(1500)
    check(not pg.locator('#notice').is_visible(), 'no demo notice when API is set')
    pg.click('#voice-toggle')  # sound off: mouth still moves
    pg.fill('#input', 'Who runs NASA right now?')
    pg.keyboard.press('Enter')
    pg.wait_for_selector('.msg.bot .sources a', timeout=10000)
    reply = pg.inner_text('.msg.bot >> nth=-1')
    check('Raven Ashford here' in reply and '**' not in reply and '[surprised]' not in reply, 'reply shown, markdown + mood tag stripped')
    check(pg.get_attribute('.sources a', 'href') == 'https://www.nasa.gov/', 'source link shown')
    pg.wait_for_timeout(250)
    st = pg.evaluate('({mood: window.__toonlight.stage.rig.mood, speaking: window.__toonlight.voice.speaking, mouth: window.__toonlight.stage.rig.mouthOpen})')
    check(st['mood'] == 'surprised' and st['speaking'] and st['mouth'] > 0.05, f'mood + talking mouth applied {st}')
    pg.screenshot(path=f'{OUT}/04-api-reply.png')
    check(not errors, f'no console errors with API {errors[:3]}')
    pg.close()

    # ---- server unreachable ----
    pg = b.new_page(viewport={'width': 1366, 'height': 800})
    pg.set_default_timeout(90000)
    with_api(pg, 'http://localhost:9999/chat')
    pg.goto('http://localhost:8765/#jun'); pg.wait_for_timeout(1200)
    pg.fill('#input', 'hello'); pg.click('#send')
    pg.wait_for_selector('.msg.system', timeout=10000)
    check("Couldn't reach the AI server" in pg.inner_text('.msg.system'), 'friendly error when server is down')
    check(pg.input_value('#input') == 'hello', 'message put back in the box to retry')
    pg.close()

    # ---- phone ----
    pg = b.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    pg.goto('http://localhost:8765/#fennick'); pg.wait_for_timeout(2500)
    w = pg.evaluate('document.documentElement.scrollWidth')
    check(w <= 390, f'no sideways scroll on phone ({w}px)')
    pg.screenshot(path=f'{OUT}/05-phone.png')
    pg.close()
    b.close()
print('\nFAILED:' if fails else '\nALL PASSED', fails or '')
sys.exit(1 if fails else 0)
