from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')


def test_homepage_preserves_primary_autokorvtostuk_focus_and_links_secondary_landing_page():
    html = read('index.html')
    assert '<title>Autokorvtõstuki rent koos operaatoriga | Tallinn ja Harjumaa</title>' in html
    assert re.search(r'<h1[^>]*>\s*Autokorvtõstuki rent koos operaatoriga\s*</h1>', html, re.I)
    assert 'korvtõstuki teenust' in html.lower()
    assert 'tõstukit kõrgustes töötamiseks' in html.lower()
    assert 'href="/korvtostuk/"' in html
    assert '<link rel="canonical" href="https://www.autokorvtostuk.ee/">' in html


def test_korvtostuk_page_targets_keyword_without_stuffing():
    html = read('korvtostuk/index.html')
    lower = html.lower()
    assert '<title>Korvtõstuk koos operaatoriga – 16 m | Tallinn ja Harjumaa</title>' in html
    assert re.search(r'<h1[^>]*>\s*Korvtõstuk koos operaatoriga\s*</h1>', html, re.I)
    assert '<link rel="canonical" href="https://www.autokorvtostuk.ee/korvtostuk/">' in html
    assert '45 €/h' in html
    assert '16 m' in html
    assert '200 kg' in html
    count = lower.count('korvtõstuk')
    assert 5 <= count <= 18


def test_tostuk_page_targets_broad_term_with_clear_context():
    html = read('tostuk/index.html')
    lower = html.lower()
    assert '<title>Tõstuk kõrgustes töötamiseks – 16 m korvtõstuk operaatoriga</title>' in html
    assert re.search(r'<h1[^>]*>\s*Tõstuk kõrgustes töötamiseks\s*</h1>', html, re.I)
    assert '<link rel="canonical" href="https://www.autokorvtostuk.ee/tostuk/">' in html
    assert 'korvtõstuk' in lower
    assert 'autokorvtõstuk' in lower
    assert 'kahveltõstuk' not in lower


def test_sitemap_lists_all_primary_pages():
    xml = read('sitemap.xml')
    for url in [
        'https://www.autokorvtostuk.ee/',
        'https://www.autokorvtostuk.ee/korvtostuk/',
        'https://www.autokorvtostuk.ee/tostuk/',
    ]:
        assert f'<loc>{url}</loc>' in xml


def test_robots_allows_crawling_and_points_to_sitemap():
    txt = read('robots.txt')
    assert 'User-agent: *' in txt
    assert 'Allow: /' in txt
    assert 'Sitemap: https://www.autokorvtostuk.ee/sitemap.xml' in txt


def test_pages_do_not_claim_from_price_or_free_slots():
    for rel in ['index.html', 'korvtostuk/index.html', 'tostuk/index.html']:
        lower = read(rel).lower()
        assert 'alates 45' not in lower
        assert 'vabu aegu' not in lower
