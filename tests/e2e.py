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
    pg.wait_for_function('[...document.querySelectorAll("#cast .face")].every(e => e.style.backgroundImage)', timeout=150000)
    check(pg.locator('#cast .card').count() == 6, 'six characters in the cast')
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
    pg.click('#open-notebook'); pg.wait_for_timeout(500); pg.click('#clear'); pg.wait_for_timeout(500)
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
    check(pg.get_attribute('#mode-text', 'aria-pressed') == 'true', 'chat-only is the default')
    pg.click('#mode-voice')
    check(pg.get_attribute('#mode-voice', 'aria-pressed') == 'true' and pg.get_attribute('#voice-toggle', 'aria-pressed') == 'true', 'voice switch works')
    pg.click('#mode-text')
    check(pg.evaluate("localStorage.getItem('toonlight:speak')") == 'off', 'chat-only choice saved')
    pg.click('#theme-toggle')
    check(pg.evaluate("document.documentElement.dataset.theme") == 'dark' and pg.evaluate("localStorage.getItem('toonlight:theme')") == 'dark', 'black theme toggles and is saved')
    pg.fill('#input', 'Who runs NASA right now?')
    pg.keyboard.press('Enter')
    pg.wait_for_selector('.msg.bot .sources a', timeout=45000)
    reply = pg.inner_text('.msg.bot >> nth=-1')
    check('Raven Ashford here' in reply and '**' not in reply and '[surprised]' not in reply, 'reply shown, markdown + mood tag stripped')
    check(pg.get_attribute('.sources a', 'href') == 'https://www.nasa.gov/', 'source link shown')
    st = pg.evaluate('({mood: window.__toonlight.stage.rig.mood, speaking: window.__toonlight.voice.speaking})')
    check(st['mood'] == 'surprised' and not st['speaking'], f'mood applied, quiet in chat-only {st}')
    check(pg.locator('.msg.bot >> nth=-1').locator('.listen').count() == 1, 'reply has a Listen button')
    pg.screenshot(path=f'{OUT}/04-api-reply.png')
    # --- memory: tell a character your name ---
    pg.fill('#input', 'hey, my name is Suhaan'); pg.keyboard.press('Enter')
    pg.wait_for_selector('.memo', timeout=45000)
    check('Suhaan' in pg.inner_text('.memo'), 'memory note shown in chat')
    pg.click('#open-notebook'); pg.wait_for_timeout(600)
    check(pg.input_value('#mem-name') == 'Suhaan', 'name saved to notebook')
    check(pg.locator('#facts li').count() == 1, 'fact listed in notebook')
    pg.screenshot(path=f'{OUT}/06-notebook.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    check(not pg.evaluate("document.getElementById('notebook').classList.contains('open')"), 'Escape closes notebook')
    # --- quiz mode with a score ---
    pg.click('.mode[data-mode="quiz"]'); pg.wait_for_timeout(500)
    check(pg.is_visible('#mode-setup') and pg.is_visible('#mode-field'), 'quiz setup shown')
    pg.fill('#mode-field', 'stacks and queues'); pg.click('#mode-start')
    pg.wait_for_function("document.querySelectorAll('.msg.bot').length >= 2", timeout=45000)
    pg.wait_for_timeout(300)
    check(pg.is_hidden('#score'), 'no score before the first answer')
    pg.fill('#input', 'A'); pg.keyboard.press('Enter')
    pg.wait_for_selector('#score:not([hidden])', timeout=45000)
    check(pg.inner_text('#score-num') == '1/1', 'quiz score badge')
    check('stacks and queues' in pg.inner_text('#window-title'), 'title shows quiz topic')
    sent = pg.evaluate("JSON.parse(localStorage.getItem('toonlight:history:raven:quiz'))[0].text")
    check('stacks and queues' in sent, 'quiz start message includes topic')
    pg.screenshot(path=f'{OUT}/07-quiz.png')
    # --- language mode ---
    pg.click('.mode[data-mode="language"]'); pg.wait_for_timeout(400)
    pg.select_option('#mode-lang', 'Spanish'); pg.click('#mode-start')
    pg.wait_for_function("document.querySelectorAll('.msg.bot').length >= 2", timeout=45000)
    pg.wait_for_timeout(500)
    check('Correction' in pg.inner_text('.msg.bot >> nth=-1'), 'language reply with correction')
    check('Spanish' in pg.inner_text('#chat-mode'), 'language shown in header')
    # --- back to chat keeps the earlier conversation ---
    pg.click('.mode[data-mode="chat"]'); pg.wait_for_timeout(400)
    check(pg.locator('.msg.user').count() == 2, 'chat history kept per mode')
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
