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

def with_api(page, url, supabase=False):
    def handler(route):
        import re
        body = re.sub(r"API_URL: '[^']*'", f"API_URL: '{url}'", open('docs/js/config.js').read())
        if supabase:
            body = re.sub(r"SUPABASE_URL: '[^']*'", "SUPABASE_URL: 'https://fake.supabase.co'", body)
            body = re.sub(r"SUPABASE_KEY: '[^']*'", "SUPABASE_KEY: 'k'", body)
        route.fulfill(status=200, content_type='text/javascript', body=body)
    page.route('**/js/config.js', handler)
    if supabase:
        import json
        def supa(route):
            u = route.request.url
            if 'grant_type=password' in u:
                body = json.loads(route.request.post_data or '{}')
                if body.get('password') == 'secret123':
                    return route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body=json.dumps({'access_token': 'good-token', 'refresh_token': 'r', 'expires_in': 3600, 'user': {'id': 'u1', 'email': body.get('email')}}))
                return route.fulfill(status=400, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body=json.dumps({'error_description': 'Invalid login credentials'}))
            if route.request.method == 'OPTIONS':
                return route.fulfill(status=200, headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*'})
            route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body='{}')
        page.route('https://fake.supabase.co/**', supa)

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
    with_api(pg, 'http://localhost:8787/chat', supabase=True)
    pg.goto('http://localhost:8765/#raven')
    pg.wait_for_timeout(1500)
    check(not pg.locator('#notice').is_visible(), 'no demo notice when API is set')
    check(pg.get_attribute('#mode-text', 'aria-pressed') == 'true', 'chat-only is the default')
    pg.click('#mode-voice')
    check(pg.get_attribute('#mode-voice', 'aria-pressed') == 'true' and pg.get_attribute('#voice-toggle', 'aria-pressed') == 'true', 'voice switch works')
    pg.click('#mode-text')
    check(pg.evaluate("localStorage.getItem('toonlight:speak')") == 'off', 'chat-only choice saved')
    themes_ok = True
    for t in ['glass', 'black', 'dark']:
        pg.click('#theme-toggle'); pg.click(f'[data-theme-pick="{t}"]'); pg.wait_for_timeout(200)
        themes_ok = themes_ok and pg.evaluate("document.documentElement.dataset.theme") == t and pg.evaluate("localStorage.getItem('toonlight:theme')") == t
        if t == 'glass': pg.screenshot(path=f'{OUT}/03-glass.png')
    check(themes_ok and pg.is_hidden('#theme-menu'), 'theme menu: glass, black and dark apply and are saved')
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
    # --- quiz: difficulty, shuffled options, the site grades, no repeats ---
    pg.click('.mode[data-mode="quiz"]'); pg.wait_for_timeout(500)
    check(pg.is_visible('#mode-setup') and pg.is_visible('#mode-field') and pg.is_visible('#mode-diff'), 'quiz setup shows topic + difficulty')
    pg.fill('#mode-field', 'stacks and queues'); pg.select_option('#mode-diff', 'hard'); pg.click('#mode-start')
    pg.wait_for_selector('.quiz .quiz-opt', timeout=45000); pg.wait_for_timeout(300)
    check(pg.locator('.quiz .quiz-opt').count() == 4 and '[quiz' not in pg.inner_text('#messages'), 'question shown as 4 answer buttons, tag hidden')
    check(pg.is_hidden('#score'), 'no score before the first answer')
    check('hard' in pg.inner_text('#window-title').lower(), 'title shows difficulty')
    sent = pg.evaluate("JSON.parse(localStorage.getItem('toonlight:history:raven:quiz'))[0].text")
    check('stacks and queues' in sent and 'hard' in sent, 'quiz start message includes topic and level')
    right = pg.locator('.quiz >> nth=-1').locator('.quiz-opt', has_text='Last In First Out')
    right.click()
    pg.wait_for_selector('#score:not([hidden])', timeout=45000)
    check(pg.inner_text('#score-num') == '1/1' and pg.locator('.quiz-opt.right').count() == 1, 'site grades the answer: 1/1, marked right')
    pg.wait_for_function("document.querySelectorAll('.quiz').length >= 2", timeout=45000); pg.wait_for_timeout(300)
    qs = pg.evaluate("[...document.querySelectorAll('.quiz-q')].map(e => e.textContent)")
    check(len(set(qs)) == len(qs), 'next question arrives and is different')
    hist = pg.evaluate("JSON.parse(localStorage.getItem('toonlight:history:raven:quiz')).filter(m => m.quiz).map(m => m.quiz)")
    wrong = 'ABCD'[(hist[-1]['answer'] + 1) % 4]
    pg.fill('#input', wrong.lower()); pg.keyboard.press('Enter')
    pg.wait_for_function("document.querySelectorAll('.quiz').length >= 3", timeout=45000); pg.wait_for_timeout(300)
    check(pg.inner_text('#score-num') == '1/2' and pg.locator('.quiz-opt.wrong').count() == 1, 'typed letter answers too; wrong answer scored 1/2')
    asked = pg.evaluate("JSON.parse(localStorage.getItem('toonlight:asked:topic:stacks and queues'))")
    check(len(asked) == 3, f'asked questions remembered for no-repeat ({len(asked)})')
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
    # --- documents: upload, ask, quiz from it ---
    import zipfile, io
    docx = io.BytesIO()
    with zipfile.ZipFile(docx, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', '<Types/>')
        z.writestr('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Photosynthesis turns sunlight, water and carbon dioxide into glucose and oxygen.</w:t></w:r></w:p><w:p><w:r><w:t>Chlorophyll in the chloroplasts absorbs mostly red and blue light, which is why leaves look green.</w:t></w:r></w:p></w:body></w:document>')
    pg.set_input_files('#doc-file', files=[{'name': 'biology.docx', 'mimeType': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'buffer': docx.getvalue()}])
    pg.wait_for_selector('#doc-bar:not([hidden])', timeout=30000)
    check('biology.docx' in pg.inner_text('#doc-bar') and 'studied' in pg.inner_text('.msg.bot >> nth=-1'), 'Word document read and studied')
    n0 = pg.locator('.msg.bot').count()
    pg.fill('#input', 'why do leaves look green?'); pg.keyboard.press('Enter')
    pg.wait_for_function(f"document.querySelectorAll('.msg.bot:not(.typing)').length > {n0}", timeout=45000); pg.wait_for_timeout(300)
    check('Chlorophyll' in pg.inner_text('.msg.bot >> nth=-1'), 'answer uses the right part of the document')
    pg.click('.mode[data-mode="quiz"]'); pg.wait_for_timeout(400)
    check(pg.is_visible('#mode-usedoc'), 'quiz offers "From my document"')
    pg.check('#mode-usedoc'); pg.fill('#mode-field', ''); pg.click('#mode-start')
    pg.wait_for_selector('.quiz .quiz-opt', timeout=45000); pg.wait_for_timeout(300)
    check('from your document' in pg.inner_text('.quiz-q >> nth=-1'), 'quiz question written from the document')
    pg.click('#doc-off'); pg.wait_for_timeout(200)
    check(pg.is_hidden('#doc-bar'), 'document can be turned off')
    # --- Agent mode: locked until signed in ---
    pg.click('.mode[data-mode="agent"]'); pg.wait_for_timeout(500)
    check(pg.locator('.gate').count() == 1 and pg.is_disabled('#input'), 'Agent mode locked when signed out')
    pg.click('.gate .btn'); pg.wait_for_timeout(300)
    pg.fill('#auth-email', 'me@example.com'); pg.fill('#auth-pass', 'wrongpass'); pg.click('#auth-submit')
    pg.wait_for_selector('.auth-msg.err', timeout=10000)
    check("don’t match" in pg.inner_text('#auth-msg'), 'wrong password shows a clear error')
    pg.fill('#auth-pass', 'secret123'); pg.click('#auth-submit')
    pg.wait_for_selector('#auth', state='hidden', timeout=10000); pg.wait_for_timeout(400)
    check('me@example.com' in pg.inner_text('#account-label') and pg.locator('.gate').count() == 0 and pg.is_enabled('#input'), 'signed in: Agent mode unlocked')
    def say(t):
        n = pg.locator('.msg.bot').count()
        pg.fill('#input', t); pg.press('#input', 'Enter')
        pg.wait_for_function(f"document.querySelectorAll('.msg.bot:not(.typing)').length > {n}", timeout=45000)
        pg.wait_for_timeout(300)
        return pg.locator('.msg.bot >> nth=-1')
    pg.evaluate("localStorage.setItem('toonlight:contacts', JSON.stringify([{name:'Rahul Shah', phone:'+1 (201) 555-0123'}]))")
    last = say('whatsapp rahul that I am not coming to class')
    href = last.locator('.action a.btn-accent').get_attribute('href')
    check('[action' not in last.inner_text() and last.locator('.action').count() == 1, 'action tag hidden, card shown')
    check(href.startswith('https://wa.me/12015550123?text=Hey%20Rahul'), f'WhatsApp link uses saved contact ({href[:45]})')
    last.locator('.action-body').fill('Running late, sorry!')
    check('Running%20late' in last.locator('.action a.btn-accent').get_attribute('href'), 'edited message goes into the link')
    last = say('find a mouse on amazon')
    check(last.locator('.action a.btn-accent').get_attribute('href') == 'https://www.amazon.com/s?k=logitech%20wireless%20mouse', 'Amazon search link')
    last = say('add a study session to my calendar')
    check('calendar.google.com/calendar/render?action=TEMPLATE&text=Study%20session' in last.locator('.action a.btn-accent').get_attribute('href'), 'Google Calendar link')
    pg.context.grant_permissions(['notifications'])
    last = say('remind me in an hour about my math notes')
    last.locator('.action button.btn-accent').click(); pg.wait_for_timeout(300)
    rem = pg.evaluate("JSON.parse(localStorage.getItem('toonlight:reminders'))")
    check(len(rem) == 1 and 55 < (rem[0]['at'] / 1000 - pg.evaluate('Date.now()') / 1000) / 60 < 61, 'reminder saved for an hour from now')
    check('set' in last.locator('.action button.btn-accent').inner_text().lower(), 'reminder button confirms')
    pg.evaluate("(() => { const r = JSON.parse(localStorage.getItem('toonlight:reminders')); r[0].at = Date.now() - 1000; localStorage.setItem('toonlight:reminders', JSON.stringify(r)); })()")
    pg.reload(); pg.wait_for_timeout(3500)
    check('math notes' in pg.inner_text('#messages') and 'Reminder' in pg.inner_text('#messages'), 'missed reminder shown on next visit')
    check(pg.locator('.action').count() >= 4, 'action cards come back after reload')
    pg.evaluate("(() => { const s = JSON.parse(localStorage.getItem('toonlight:session')); s.access_token = 'forged'; s.expires_at = Date.now() + 3600e3; localStorage.setItem('toonlight:session', JSON.stringify(s)); })()")
    pg.reload(); pg.wait_for_timeout(2500)
    pg.fill('#input', 'remind me in an hour about my math notes'); pg.keyboard.press('Enter')
    pg.wait_for_selector('#auth:not([hidden])', timeout=45000); pg.wait_for_timeout(300)
    check('sign in again' in pg.inner_text('#messages').lower() and pg.is_visible('#auth'), 'server rejects a forged sign-in')
    g = pg.evaluate("window.__toonlight.stage.rig.gestures ? 'yes' : 'no'")
    check(g == 'yes', 'character has gestures')
    errors = [e for e in errors if not ('status of 400' in e or 'status of 401' in e)]  # the wrong-password and forged-token checks above
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
