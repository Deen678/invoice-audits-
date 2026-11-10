import re, json, time, sys, requests
BASE = "https://skyrocketcontent.co"
s = requests.Session(); s.headers["User-Agent"] = "Mozilla/5.0 (price check)"
html = s.get(BASE + "/services", timeout=30).text
TOKEN = re.search(r"_token:\s*'([^']+)'", html).group(1)
IDS = sorted({int(x) for x in re.findall(r"fetchProductData\((\d+)\)", html)})
def details(i):
    r = s.post(BASE + "/cart/product-details", data={"_token": TOKEN, "id": i}, headers={"X-Requested-With": "XMLHttpRequest", "Referer": BASE + "/services"}, timeout=30)
    time.sleep(0.6); return r.json() if r.text.strip().startswith("{") else {"error": r.status_code, "text": r.text[:120]}
def price(i, wc, img=1, qty=1, ta=0, q=0):
    r = s.post(BASE + "/cart/product-price", data={"_token": TOKEN, "id": i, "wc": wc, "img": img, "qty": qty, "ta": ta, "qlty": q}, headers={"X-Requested-With": "XMLHttpRequest", "Referer": BASE + "/services"}, timeout=30)
    time.sleep(0.6)
    try: return float(json.loads(r.text))
    except Exception: return None
if __name__ == "__main__":
    out = {}
    for i in IDS:
        d = details(i); out[i] = d
        print(i, {k: d.get(k) for k in ("name", "default_wc", "default_price", "error")})
    json.dump(out, open("details.json", "w"), indent=1)
