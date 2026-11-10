# skyrocketcontent.co combination finder

skyrocketcontent.co shows no prices on its pages. Every price comes from its
order pop-up, which asks the site's server. With the owner's permission
(10 Nov 2026), the prices were sampled for all 14 products and the formula
worked out, then checked against the live server:

    price = quantity x quality x (starting price
                                  + word rate x (words - starting words)
                                  + 15% of starting price per extra image
                                  + $25 if Express)

- quality: Standard x1.00, Premium x1.10, Expert x1.25
- words go up from the product's starting count in steps of 25
- each product's starting words, starting price and word rate are in details.json / samples.json

Find every single-item way to make an amount (no requests sent; works from the saved data):

    python3 solve.py 50 120

Check a specific combination against the live server (sends one price request):

    python3 -c "import sky; print(sky.price(4, wc=200, q=2))"
