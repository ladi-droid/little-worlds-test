#!/usr/bin/env python3
"""Build A's World (the claude.ai artifact) from this repo, so every change is made once.

The test site's play.html is the one main copy of the game. A's World is the same page with the
site-only part taken out (home-screen tags, per-child icon, LW_SITE_MODE), so it always runs as
A's World: no child settings, no practice street.

  python3 tools/build-as-world.py            # writes dist/as-world/ and lists what changed
  python3 tools/build-as-world.py --mark     # after publishing: remember what A's World now holds

A's World keeps only the last KEEP trips in trip order (Ladi 2026-11-07): when a new trip is added at the
end, the oldest one drops out. The test site keeps every trip. Every kept trip is always open.
A new trip needs its picture lists in AREA_LISTS below (the script stops if one is missing).

Output:
  dist/as-world/index.html     the page to publish (Artifact file_path)
  dist/as-world/files.json     every file A's World needs: {published path: repo path}
  dist/as-world/changed.json   only the files that differ from the last publish (pass as `files`)

Publishing (done by Claude with the Artifact tool, url = A's World):
  file_path = dist/as-world/index.html, files = contents of changed.json
  then run with --mark and commit tools/as-world-published.json.
"""
import hashlib, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'dist', 'as-world')
MANIFEST = os.path.join(ROOT, 'tools', 'as-world-published.json')
LIMIT = 511            # claude.ai artifact file limit (page included)

# site-only pictures: the landing page and the child's own cards; A's World never shows them
SITE_ONLY = re.compile(r'^(hero_.*|ui_card_.*_empty|ui_splash_empty)\.webp$')

KEEP = 5               # how many of the latest trips A's World keeps
# each trip's picture lists in play.html (XX means `const XX_IMAGES = [...]`), plus pictures it borrows from older trips
AREA_LISTS = {'woolwich': ['WW'], 'brixton': ['BX'], 'greenwich': ['GW2'], 'towerbridge': ['TB'], 'canarywharf': ['CW'],
              'westend': ['WE'], 'heathrow': ['HW'], 'olddubai': ['DX'], 'downtown': ['DT'], 'palm': ['PM'],
              'marina': ['MA', 'DS'], 'desert': ['DS'], 'capetown': ['CT'], 'westminster': ['WM'], 'barcelona': ['BC']}
DUBAI_KID = ['a_run_dxb', 'a_jump_dxb', 'a_lean_dxb', 'a_side_dxb', 'dx_cat', 'dx_crow']   # A's Dubai outfit
BORROWS = {'palm': DUBAI_KID, 'marina': DUBAI_KID + ['bx_car1'], 'desert': DUBAI_KID, 'downtown': DUBAI_KID,
           'westminster': ['a_back_ldn'], 'barcelona': DUBAI_KID + ['dt_aback']}


def sha(path):
    with open(os.path.join(ROOT, path), 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def build_page(keep=None, have=None):
    src = open(os.path.join(ROOT, 'play.html'), encoding='utf8').read()
    a, b = src.find('<!-- site-only:start'), src.find('<!-- site-only:end -->')
    assert a > 0 and b > a, 'play.html is missing its site-only markers'
    page = src[:a] + src[b + len('<!-- site-only:end -->'):]
    assert 'LW_SITE_MODE=1' not in page, 'site mode would still switch on in A\'s World'
    page = re.sub(r'(\.(?:js|webp|png|html))\?v=[0-9a-z]+', r'\1', page)   # cache stamps are for GitHub Pages only
    if keep is not None:
        tag = '<script src="game.js"></script>'
        assert page.count(tag) == 1, 'play.html should load game.js once'
        cfg = ('<script>window.LW_TRIPS=' + json.dumps([i for i, _ in keep]) + ';window.LW_ALL_OPEN=1;'
               'window.LW_HAVE=' + json.dumps({f: 1 for f in have}, separators=(',', ':')) + ';</script>\n')
        page = page.replace(tag, cfg + tag)
    return page


def trips():
    """The trips in play order, as (id, area), without the parked ones."""
    g = open(os.path.join(ROOT, 'game.js'), encoding='utf8').read()
    parked = re.findall(r"'(\w+)'", re.search(r'const PARKED = \[(.*?)\]', g).group(1))
    body = g[g.index('const ALL_LEVELS = ['):g.index('const PARKED')]
    return [(i, a) for i, a in re.findall(r"\n  id: '(\w+)',.*?area: '(\w+)'", body) if i not in parked]


def picture_lists(src):
    out = {}
    for name, body in re.findall(r'const (\w+)_IMAGES = \[(.*?)\];', src, re.S):
        out[name] = re.findall(r"'([\w]+)'", body)
    return out


def needed_files(page, keep):
    """Every file the kept trips can load: game code, sounds, shared art and the kept trips' pictures.
    Pictures that are in no trip's list are shared (the code builds some names on the fly), so they all stay."""
    src = open(os.path.join(ROOT, 'play.html'), encoding='utf8').read()
    atlas = json.loads(re.search(r'const ATLAS = (\{.*?\});/\* ATLAS-MAP END', src).group(1))
    atlas_of = {k: f for f, ks in atlas.items() for k in ks}
    lists = picture_lists(src)
    file_of = lambda k: atlas_of.get(k, k + '.webp')
    owner = {}                                 # picture file -> the trips whose lists name it
    for area, names in AREA_LISTS.items():
        for n in names:
            for k in lists[n]:
                owner.setdefault(file_of(k), set()).add(area)
    areas = {a for _, a in keep}
    for a in areas:
        assert a in AREA_LISTS, f'trip area {a!r} has no picture lists in AREA_LISTS (tools/build-as-world.py)'
    want = {file_of(k) for a in areas for k in BORROWS.get(a, [])}
    ids = {i for i, _ in keep}
    files = ['game.js', 'sfx.js', 'kids/kids-meta.js', 'kids/kids.js']
    for name in sorted(os.listdir(ROOT)):
        if not name.endswith('.webp') or SITE_ONLY.match(name):
            continue
        m = re.match(r'ui_(card|sign)_(\w+)\.webp$', name)
        if m and m.group(2) not in ids:
            continue                           # the picker card of a trip that isn't kept
        if name in owner and not (owner[name] & areas) and name not in want:
            continue                           # a picture only older trips use
        files.append(name)
    cdir = os.path.join(ROOT, 'cities', 'london')
    for name in sorted(os.listdir(cdir)):
        if name.endswith('.webp'):
            files.append('cities/london/' + name)
    for f in files:
        assert os.path.exists(os.path.join(ROOT, f)), f
    return files


def main():
    keep = trips()[-KEEP:]
    files = needed_files(build_page(), keep)
    page = build_page(keep, files)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'index.html'), 'w', encoding='utf8') as f:
        f.write(page)
    hashes = {f: sha(f) for f in files}
    old = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
    if '--mark' in sys.argv:
        json.dump(dict(sorted(hashes.items())), open(MANIFEST, 'w'), indent=0)
        print(f'marked {len(hashes)} files as published')
        return
    changed = {f: f for f in files if old.get(f) != hashes[f]}
    gone = sorted(set(old) - set(files))
    json.dump({f: f for f in files}, open(os.path.join(OUT, 'files.json'), 'w'), indent=0)
    json.dump(changed, open(os.path.join(OUT, 'changed.json'), 'w'), indent=0)
    total = len(files) + 1
    print("A's World trips:", ', '.join(i for i, _ in keep), '(all open)')
    print(f"A's World: page {len(page) // 1024} KB + {len(files)} files ({total} of {LIMIT} allowed)")
    print(f'changed since last publish: {len(changed)}' + (f' (publish in batches of 255)' if len(changed) > 255 else ''))
    for f in list(changed)[:40]:
        print('  ', f)
    if gone:
        print('no longer needed (can be removed with null in files):', ', '.join(gone))
    if total > LIMIT:
        sys.exit(f'too many files for an artifact: {total} > {LIMIT}')


if __name__ == '__main__':
    main()
