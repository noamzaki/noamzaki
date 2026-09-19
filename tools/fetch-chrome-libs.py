#!/usr/bin/env python3
"""Resolve every shared library headless Chrome needs into .cache/chromelibs.

Debian/Ubuntu ships these as packages but installing them needs root, so this
downloads the .deb files, unpacks just the .so files and points Chrome at them
through LD_LIBRARY_PATH. Run tools/setup-chrome.sh instead of calling this directly.
"""
import urllib.request, lzma, os, io, tarfile, gzip, subprocess, glob, sys, re
try:
    import zstandard
except ImportError:
    sys.exit("pip install zstandard   (needed to unpack modern .deb files)")

MIRROR = "https://deb.debian.org/debian"
CODENAME = "trixie"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".cache", "chromelibs")
CHROMES = glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".cache", "puppeteer", "chrome", "*", "chrome-linux64", "chrome"))
if not CHROMES:
    sys.exit("Install Chrome first:  npx puppeteer browsers install chrome")
CHROME = CHROMES[0]
os.makedirs(OUT, exist_ok=True)
dz = zstandard.ZstdDecompressor()

print("loading package index…")
index_raw = lzma.decompress(urllib.request.urlopen(f"{MIRROR}/dists/{CODENAME}/main/binary-amd64/Packages.xz", timeout=300).read()).decode("utf-8", "ignore")
INDEX = {}
for stanza in index_raw.split("\n\n"):
    if "Package:" not in stanza:
        continue
    d = {}
    for line in stanza.split("\n"):
        if line[:1] == " " or ":" not in line:
            continue
        k, v = line.split(":", 1)
        d[k.strip()] = v.strip()
    if d.get("Package") and d.get("Filename") and d["Package"] not in INDEX:
        INDEX[d["Package"]] = d["Filename"]
print(f"  {len(INDEX)} packages available")


def extract(deb_bytes):
    off, members = 8, {}
    while off < len(deb_bytes):
        hdr = deb_bytes[off:off + 60]
        off += 60
        if len(hdr) < 60:
            break
        name = hdr[0:16].decode().strip()
        size = int(hdr[48:58].decode().strip())
        members[name] = deb_bytes[off:off + size]
        off += size + (size % 2)
    key = [k for k in members if k.startswith("data.tar")][0]
    raw = members[key]
    dec = dz.decompress(raw, max_output_size=400 * 1024 * 1024) if key.endswith(".zst") \
        else lzma.decompress(raw) if key.endswith(".xz") else gzip.decompress(raw)
    links = []
    for m in tarfile.open(fileobj=io.BytesIO(dec)).getmembers():
        if ".so" not in m.name or m.isdir():
            continue
        target = os.path.join(OUT, os.path.basename(m.name))
        if m.issym() or m.islnk():
            links.append((target, os.path.basename(m.linkname)))
            continue
        f = tarfile.open(fileobj=io.BytesIO(dec)).extractfile(m) if False else None
        # need a fresh handle per member
        tf = tarfile.open(fileobj=io.BytesIO(dec))
        fh = tf.extractfile(m)
        if not fh:
            continue
        open(target, "wb").write(fh.read())
        os.chmod(target, 0o755)
    for target, dest in links:
        if not os.path.exists(target) and os.path.exists(os.path.join(OUT, dest)):
            os.symlink(dest, target)
    return True


def missing():
    files = [CHROME] + [p for p in glob.glob(OUT + "/*") if os.path.isfile(p) and not os.path.islink(p)]
    out = subprocess.run(["ldd", *files], capture_output=True, text=True, env=dict(os.environ, LD_LIBRARY_PATH=OUT)).stdout
    return sorted({m for m in re.findall(r"(\S+\.so[\.\d]*)\s*=>\s*not found", out)})


def candidates(soname):
    base, _, ver = soname.partition(".so")
    ver = ver.lstrip(".")
    short = ver.split(".")[0]
    c = [f"{base}{ver}", f"{base}-{ver}", f"{base}{short}", f"{base}-{short}",
         base.replace("-", "") + ver, base.replace("-", "") + "-" + ver,
         f"{base}{ver}t64", f"{base}-{ver}t64"]
    norm = base.lower().replace(".", "").replace("-", "")
    fuzzy = sorted([n for n in INDEX if n.lower().replace(".", "").replace("-", "").startswith(norm)],
                   key=lambda n: (ver not in n, len(n)))
    return [x for x in c + fuzzy[:4]]


for round_no in range(1, 12):
    miss = missing()
    if not miss:
        print(f"round {round_no}: nothing missing ✓")
        break
    print(f"round {round_no}: {len(miss)} missing -> {miss}")
    progressed = False
    for soname in miss:
        for cand in candidates(soname):
            if cand not in INDEX:
                continue
            data = urllib.request.urlopen(f"{MIRROR}/{INDEX[cand]}", timeout=180).read()
            extract(data)
            if os.path.exists(os.path.join(OUT, soname)):
                print(f"   ✓ {soname} ← {cand}")
                progressed = True
                break
    if not progressed:
        sys.exit("still missing: " + ", ".join(missing()))
print("shared libraries ready in", OUT)
