import json, sys
from decimal import Decimal, ROUND_HALF_UP
D = json.load(open("details.json")); S = json.load(open("samples.json"))
QM = {0: 1.0, 1: 1.1, 2: 1.25}; QN = {0: "Standard quality", 1: "Premium quality", 2: "Expert quality"}
P = {}
for i, d in D.items():
    s = S[i]; W = d["default_wc"]; B = float(d["default_price"])
    r = round((s["w+250"][1] - B) / 250, 6)
    P[int(i)] = dict(name=" ".join(d["name"].split()).title(), W=W, B=B, r=r)
def price(p, wc, img=1, qty=1, ta=0, q=0):
    return qty * QM[q] * (p["B"] + p["r"] * (wc - p["W"]) + 0.15 * p["B"] * (img - 1) + 25 * ta)
def shown(x):   # how the site displays it (2 decimals)
    return float(Decimal(repr(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
def options(target, max_img=6, max_qty=6):
    hits = []
    for i, p in P.items():
        for q in (0, 1, 2):
            for ta in (0, 1):
                for img in range(1, max_img + 1):
                    for qty in range(1, max_qty + 1):
                        wc = p["W"]
                        while True:
                            v = price(p, wc, img, qty, ta, q)
                            if shown(v) > target + 0.005: break
                            if abs(shown(v) - target) < 0.005: hits.append(dict(id=i, wc=wc, img=img, qty=qty, ta=ta, q=q, price=v))
                            wc += 25
                            if p["r"] == 0: break
    return hits
def describe(h):
    p = P[h["id"]]
    bits = [f'{p["name"]}', f'{h["wc"]:,} words', QN[h["q"]], "Express (2-3 days)" if h["ta"] else "Standard turnaround (5-7 days)"]
    if h["img"] > 1: bits.append(f'{h["img"]} images')
    if h["qty"] > 1: bits.append(f'quantity {h["qty"]}')
    return ", ".join(bits)
if __name__ == "__main__":
    for t in map(float, sys.argv[1:]):
        hs = options(t)
        hs.sort(key=lambda h: (h["qty"], h["img"], h["ta"], h["q"], h["wc"] - P[h["id"]]["W"]))
        print(f"\n=== ${t:.2f}: {len(hs)} single-item ways ===")
        for h in hs: print(f'  {describe(h)}  -> ${shown(h["price"]):.2f}  (exact {h["price"]:.4f})')
        json.dump(hs, open(f"hits-{t:.2f}.json", "w"), indent=1)
