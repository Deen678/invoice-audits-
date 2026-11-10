# Invoice Audits

A Claude Code agent that finds the prices a business charges on its website,
and checks invoices against them.

## Use
Open this repo in Claude Code and ask, e.g.:

> Use the invoice-auditor agent to find the prices on marketandmatter.com

> Use the invoice-auditor agent to find the SEO and PPC prices on marketandmatter.com

> Use the invoice-auditor agent to check this invoice against marketandmatter.com (attach the invoice)

## What it does
- **Finds prices:** opens every page like a visitor, clicks each term or option
  (e.g. 1 / 3 / 6 / 12 months) and records every price shown. It works out
  monthly vs total figures, and flags prices that disagree between pages or
  are labelled wrongly.
- **Checks invoices:** compares each invoice line with the site's price for that
  package and term, and checks the maths (quantities, discounts, tax, totals)
  and the currency.

It only reads websites. It never submits forms, adds to cart or pays.

## Pieces
- `.claude/agents/invoice-auditor.md`: the agent's instructions
- `scripts/find-prices.js`: finds every visible price on a site, including prices behind term/option buttons (writes `prices.csv` and `prices.json`)

Requires Node.js with `playwright` and `docx`.
