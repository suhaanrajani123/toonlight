# Screenshot the full app at a few sizes. Usage: python3 tests/look.py [hash]
import sys, re
from playwright.sync_api import sync_playwright
OUT='/tmp/claude-0/-home-claude/3fe70163-cebc-57b3-9939-d7602cda3cd0/scratchpad/look'
import os; os.makedirs(OUT, exist_ok=True)
h = sys.argv[1] if len(sys.argv) > 1 else 'kaito'
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    for name, vp, mob, theme in [('desktop', (1440, 900), False, 'light'), ('desktop-dark', (1440, 900), False, 'dark'), ('phone-dark', (390, 844), True, 'dark')]:
        pg = b.new_page(viewport={'width': vp[0], 'height': vp[1]}, is_mobile=mob, has_touch=mob)
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and 'TUNNEL' not in m.text and errs.append(m.text))
        def cfg(route):
            body = re.sub(r"API_URL: '[^']*'", "API_URL: ''", open('docs/js/config.js').read())
            route.fulfill(status=200, content_type='text/javascript', body=body)
        pg.route('**/js/config.js', cfg)
        pg.add_init_script(f"localStorage.setItem('toonlight:theme', '{theme}')")
        pg.goto(f'http://localhost:8765/#{h}')
        pg.wait_for_function('[...document.querySelectorAll(".card .face")].every(e => e.style.backgroundImage)', timeout=120000)
        pg.wait_for_timeout(1500)
        pg.screenshot(path=f'{OUT}/{name}.png', full_page=mob)
        print(name, 'errors:', errs[:3], 'scrollW', pg.evaluate('document.documentElement.scrollWidth'))
        pg.close()
    b.close()
