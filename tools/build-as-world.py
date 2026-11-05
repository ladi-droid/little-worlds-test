#!/usr/bin/env python3
"""Build A's World (the claude.ai artifact) from this repo, so every change is made once.

The test site's play.html is the one main copy of the game. A's World is the same page with the
site-only part taken out (home-screen tags, per-child icon, LW_SITE_MODE), so it always runs as
A's World: no child settings, no practice street.

  python3 tools/build-as-world.py            # writes dist/as-world/ and lists what changed
  python3 tools/build-as-world.py --mark     # after publishing: remember what A's World now holds

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


def sha(path):
    with open(os.path.join(ROOT, path), 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def build_page():
    src = open(os.path.join(ROOT, 'play.html'), encoding='utf8').read()
    a, b = src.find('<!-- site-only:start'), src.find('<!-- site-only:end -->')
    assert a > 0 and b > a, 'play.html is missing its site-only markers'
    page = src[:a] + src[b + len('<!-- site-only:end -->'):]
    assert 'LW_SITE_MODE=1' not in page, 'site mode would still switch on in A\'s World'
    page = re.sub(r'(\.(?:js|webp|png|html))\?v=[0-9a-z]+', r'\1', page)   # cache stamps are for GitHub Pages only
    return page


def needed_files(page):
    """Every file the game can load: game code, sounds, and every picture except the site-only ones
    (the code builds many picture names on the fly, so pictures aren't picked by searching the code)."""
    code = page + open(os.path.join(ROOT, 'game.js'), encoding='utf8').read()
    files = ['game.js', 'sfx.js', 'kids/kids-meta.js', 'kids/kids.js']
    for name in sorted(os.listdir(ROOT)):
        if name.endswith('.webp') and not SITE_ONLY.match(name):
            files.append(name)
    cdir = os.path.join(ROOT, 'cities', 'london')
    for name in sorted(os.listdir(cdir)):
        if name.endswith('.webp'):
            files.append('cities/london/' + name)
    for f in files:
        assert os.path.exists(os.path.join(ROOT, f)), f
    return files


def main():
    page = build_page()
    files = needed_files(page)
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
