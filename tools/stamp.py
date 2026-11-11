# Test site: give every internal link a fresh ?v= on each push, so phones fetch the new files
# instead of the copy GitHub Pages lets them keep for 10 minutes.
#   python3 tools/stamp.py          (run from anywhere; stamps the repo's pages in place)
import os, re, time
S = str(int(time.time()))
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def fix(name, subs):
    p = os.path.join(root, name); s = open(p, encoding='utf8').read()
    s = re.sub(r'\?v=[0-9a-z]+&', '?', s); s = re.sub(r'\?v=[0-9a-z]+(?=["#\'`])', '', s)   # drop old stamps
    for a, b in subs: s = re.sub(a, b, s)
    open(p, 'w', encoding='utf8').write(s)
links = [(r'href="(builder|login|index|feedback)\.html\?', rf'href="\1.html?v={S}&'),
         (r'href="(builder|login|index|feedback)\.html(?=["#])', rf'href="\1.html?v={S}')]
kids = [(r'src="kids/(kids-meta|kids)\.js"', rf'src="kids/\1.js?v={S}"'), (r'src="lw-ping\.js"', f'src="lw-ping.js?v={S}"')]
fix('index.html', links + kids)
fix('builder.html', links + kids + [(r"const GAME='play\.html';", f"const GAME='play.html?v={S}';"), (r"GAME\+'\?w='", "GAME+'&w='")])
fix('feedback.html', links)
fix('login.html', links + [(r"GAME='play\.html';", f"GAME='play.html?v={S}';"), (r"GAME\+'\?w='", "GAME+'&w='")])
fix('play.html', kids + [(r'src="game\.js"', f'src="game.js?v={S}"'), (r'src="sfx\.js"', f'src="sfx.js?v={S}"'), (r"'builder\.html\?w='", f"'builder.html?v={S}&w='")])
print('stamp', S)
