# Credit Card Points Optimizer

A small, dependency-free tool for maximizing Indian credit card reward
value: given your card portfolio's multiplier rules and this month's
spending by category, it tells you exactly which card (and which channel —
direct swipe vs. brand-voucher portal) to use for each category, and
tracks progress toward each card's spend milestones.

This replicates, in code, the "vibe-coded" workflow described on
*The Great Indian Points & Miles Show*: rather than a generic tracker app,
you keep your own card rules and monthly spend in two small JSON files and
let a script (or an LLM, via `ai_prompt_template.md`) compute the optimal
swipe strategy.

## How it works

1. **`cards.json`** — your card portfolio: base reward rate, any bonus
   channels (e.g. HDFC SmartBuy, Amex Gyftr) with their rate and monthly
   bonus-spend cap, and milestone targets (e.g. "₹4,00,000/year for 24,000
   bonus points").
2. **`spending.json`** — this month's spend by category, and which channel
   on each card (if any) applies to that category.
3. **`optimizer.py`** — reads both files and greedily routes each spending
   category to the card + channel that yields the most reward value,
   respecting monthly bonus-spend caps (highest-yield categories get first
   claim on a limited cap), then reports milestone progress.

Copy the `.example.json` files, remove `.example`, and edit them with your
own cards and spend:

```bash
cp cards.example.json cards.json
cp spending.example.json spending.json
# edit cards.json and spending.json with your own numbers
python3 optimizer.py --cards cards.json --spending spending.json
```

`cards.example.json` ships pre-filled for a 5-card premium India portfolio
(HDFC Infinia, HSBC Premier Metal, Axis Magnus for Burgundy, Axis Olympus,
IndusInd Legend) with reward rates sourced in September 2026 — see
**Card data sources** below. Every rate carries a `notes` field explaining
the assumption behind it (point valuation, forex markup, caps); read those
before trusting a number.

Example output:

```
Swipe Strategy — 2026-09
============================================================
- Rent / Maintenance: ₹40,000 -> Axis Magnus for Burgundy [direct swipe] @ 6.00% (~₹2,400 value)
- Grocery & Food Delivery Vouchers (Swiggy/Zomato via SmartBuy): ₹15,000 -> HDFC Infinia [smartbuy_vouchers] @ 16.67% (~₹2,501 value)
- Hotel Booking (via SmartBuy): ₹25,000 -> HDFC Infinia [smartbuy_hotels] @ 33.30% (~₹8,325 value)
- Flight Booking (via Travel EDGE portal): ₹30,000 -> Axis Magnus for Burgundy [travel_edge_portal] @ 30.00% (~₹9,000 value)
- International Spend: ₹20,000 -> Axis Olympus [international_spend] @ 5.80% (~₹1,160 value)
- Apple Purchase (via HSBC Unicorn): ₹12,000 -> HSBC Premier Metal [apple_unicorn] @ 18.00% (~₹2,160 value)
...

Total spend: ₹171,000 | Total est. value: ₹27,419 | Blended rate: 16.03%

Milestone status:
  [IndusInd Legend] Year-1 spend bonus (one-time, within 1 year of card issuance): ₹0 / ₹500,000 -> ₹500,000 remaining | reward: 3,000 bonus reward points (~₹2,250 at ₹0.75/point)

Card notes / caveats:
  [HDFC Infinia] Base = 5 RP/₹150, valuing 1 RP = ₹1 (best-case redemption via SmartBuy flights/hotels...) ...
```

Run `python3 optimizer.py --cards cards.example.json --spending spending.example.json`
to see the full output. Use `--output json` to get machine-readable output
(e.g. to push into a Google Sheet via Apps Script or a Sheets API call).

## `sheet_templates/`

If you'd rather track things in Google Sheets (as in the original
interview), import these as two tabs:

- `card_rules_reference.csv` — your card multiplier rules.
- `spending_ledger.csv` — a running log of swipes: date, card, category,
  channel used, amount, effective rate, and value earned.

## `ai_prompt_template.md`

A copy-paste prompt for ChatGPT/Claude/Gemini that reproduces the same
recommendation conversationally when you'd rather not maintain JSON files.
For the email/statement-parsing side of the original workflow (auto-import
transactions into the ledger), wire a Gmail trigger through Make.com/Zapier
into an LLM extraction step that appends rows to `spending_ledger.csv` or
your Sheet — that part is account-specific and isn't included here.

## Card data sources

Rates in `cards.example.json` were researched in September 2026 from:
[Paisabazaar - HDFC Infinia](https://www.paisabazaar.com/hdfc-bank/infinia-credit-card/),
[CardExpress - HDFC Infinia devaluation](https://cardexpress.in/articles/hdfc-smartbuy-voucher-rewards-capped-3000-devaluation-2026),
[HSBC - Premier Mastercard Rewards](https://www.hsbc.bank.in/credit-cards/products/premier/rewards/),
[CardInsider - HSBC forex markup](https://cardinsider.com/hsbc-bank/hsbc-credit-card-low-forex-markup-charges/),
[Paisabazaar - Axis Magnus for Burgundy](https://www.paisabazaar.com/axis-bank/magnus-burgundy-credit-card/),
[CardExpert - Axis Magnus Burgundy](https://www.cardexpert.in/axis-magnus-burgundy-credit-card-review/),
[Paisabazaar - Axis Olympus](https://www.paisabazaar.com/axis-bank/olympus-credit-card/),
[Paisabazaar - IndusInd Legend](https://www.paisabazaar.com/indusind-bank/indusind-bank-legend-credit-card/),
[Wise - IndusInd Legend review](https://wise.com/in/blog/indusind-legend-credit-card-review),
[Wise - HDFC Infinia review](https://wise.com/in/blog/hdfc-infinia-credit-card-review).

Reward programs in India change frequently (HDFC Infinia alone had cuts in
January and July 2026) — treat every rate here as a starting point to
verify, not a guarantee.

## Notes

- All figures in the example files are illustrative, not financial advice
  — always verify current multiplier rates and milestone terms against the
  issuer's official T&Cs before relying on them.
- Point-to-rupee valuation is a modeling assumption baked into each
  `rate_percent`: HDFC/HSBC/Axis points are valued near ₹1 each (their
  best-case airline/hotel transfer value — cash/statement-credit
  redemptions are worth meaningfully less), IndusInd Legend points at
  their ₹0.75 cash-redemption rate. If you redeem differently, rescale the
  rates in `cards.json` to match.
- The optimizer is a single-pass greedy allocator: it's built to be a
  simple, transparent personal tool, not a global optimizer across
  interacting caps. For most portfolios (a handful of cards, a handful of
  categories) this gives the same answer a careful manual pass would.
- It has no day-of-week logic, so IndusInd Legend's weekend 2x needs to be
  routed manually via the `weekend_spend` channel, and no forex-fee logic
  by default — forex-adjusted rates are pre-baked into each card's
  `international_spend` channel where relevant instead.
