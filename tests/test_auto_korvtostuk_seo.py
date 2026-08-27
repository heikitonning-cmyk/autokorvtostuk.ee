from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')


def test_auto_korvtostuk_landing_targets_spaced_search_phrase_naturally():
    html = read('auto-korvtostuk/index.html')
    lower = html.lower()
    assert '<title>Auto korvtõstuk Tallinnas – 16 m koos operaatoriga</title>' in html
    assert '<h1>Auto korvtõstuk Tallinnas koos operaatoriga</h1>' in html
    assert '<link rel="canonical" href="https://www.autokorvtostuk.ee/auto-korvtostuk/">' in html
    assert 'auto korvtõstuk' in lower
    assert 'autokorvtõstuk' in lower
    assert 'korvtõstuk' in lower
    assert '45 €/h' in html
    assert '16 m' in html
    assert '200 kg' in html
    assert lower.count('auto korvtõstuk') <= 8


def test_homepage_links_auto_korvtostuk_landing():
    html = read('index.html')
    assert 'href="/auto-korvtostuk/"' in html


def test_sitemap_lists_auto_korvtostuk_landing():
    xml = read('sitemap.xml')
    assert '<loc>https://www.autokorvtostuk.ee/auto-korvtostuk/</loc>' in xml
