"""Loads the app in headless Chromium at phone size, plays it, and saves screenshots.
Usage: python3 tests/browser-test.py   (serves www/ on a local port by itself)"""
import http.server, os, socketserver, sys, threading, json
from functools import partial
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'www')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)

Handler = partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
Handler.log_message = lambda *a: None
httpd = socketserver.TCPServer(('127.0.0.1', 0), Handler)
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    for scheme in ['light', 'dark']:
        page = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme=scheme)
        page.on('console', lambda m: errors.append(f'{scheme} console {m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: errors.append(f'{scheme} pageerror: {e}'))
        page.goto(f'http://127.0.0.1:{port}/index.html')
        page.wait_for_timeout(500)
        page.screenshot(path=f'{OUT}/{scheme}-idle.png', full_page=False)
        page.click('#play')
        page.wait_for_timeout(9000)
        info = page.evaluate('''() => { const a = window.leafFall; return {
            ready: a.audio.ready, state: a.audio.ctx && a.audio.ctx.state, voices: a.audio.voiceState.size,
            leaves: a.forest.leaves.length, mass: a.audio.mass, now: a.audio.now, ids: a.forest.nextId } }''')
        print(scheme, json.dumps(info))
        page.screenshot(path=f'{OUT}/{scheme}-playing.png', full_page=False)
        page.click('#rain'); page.click('#gust')
        page.wait_for_timeout(3000)
        page.screenshot(path=f'{OUT}/{scheme}-rain.png', full_page=False)
        if scheme == 'light':
            page.screenshot(path=f'{OUT}/forest-tab.png', full_page=True)
            page.click('.tab[data-tab="species"]')
            page.wait_for_timeout(300)
            page.click('text=Play a leaf')
            page.screenshot(path=f'{OUT}/species-tab.png', full_page=True)
            # switch engine and tree, change columns
            page.select_option('#panel-species select >> nth=1', 'grain')
            page.select_option('#panel-species select >> nth=0', 'ginkgo')
            page.wait_for_timeout(200)
            page.click('.tab[data-tab="forest"]')
            page.select_option('#panel-forest select >> nth=1', '16')
            page.wait_for_timeout(1500)
            page.screenshot(path=f'{OUT}/sixteen.png', full_page=False)
            page.click('.tab[data-tab="presets"]')
            page.click('text=Windstorm')
            page.wait_for_timeout(4000)
            page.screenshot(path=f'{OUT}/presets-tab.png', full_page=True)
            info = page.evaluate('() => ({ voices: window.leafFall.audio.voiceState.size, cols: window.leafFall.state.globals.columns, slot0: window.leafFall.state.slots[0].type })')
            print('after preset', json.dumps(info))
        page.close()
    browser.close()
httpd.shutdown()
print('\n'.join(errors) if errors else 'no console errors')
sys.exit(1 if any('pageerror' in e or 'console error' in e for e in errors) else 0)
