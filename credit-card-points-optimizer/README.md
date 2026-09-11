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

Example output:

```
Swipe Strategy — 2026-09
============================================================
- Rent / Maintenance: ₹40,000 -> HDFC Infinia [direct swipe] @ 3.30% (~₹1,320 value)
- Grocery & Food Delivery (Swiggy/Zomato): ₹15,000 -> HDFC Infinia [smartbuy_vouchers] @ 33.00% (~₹4,950 value)
- Amazon/Flipkart Shopping: ₹10,000 -> HDFC Infinia [smartbuy_vouchers] @ 33.00% (~₹3,300 value)
- Fuel: ₹5,000 -> HDFC Infinia [direct swipe] @ 3.30% (~₹165 value)
- Flights/Hotels: ₹15,000 -> HDFC Infinia [smartbuy_travel] @ 16.50% (~₹2,475 value)
- Other Online Spends: ₹8,000 -> SBI Cashback [online_spends] @ 5.00% (~₹400 value)

Total spend: ₹93,000 | Total est. value: ₹12,610 | Blended rate: 13.56%

Milestone status:
  [Amex Platinum Travel] First milestone (annual): ₹150,000 / ₹190,000 -> ₹40,000 remaining | reward: 10,000 bonus Membership Rewards points
  [Amex Platinum Travel] Second milestone (annual): ₹150,000 / ₹400,000 -> ₹250,000 remaining | reward: 24,000 bonus points + ₹10,000 Taj voucher
```

Use `--output json` to get machine-readable output (e.g. to push into a
Google Sheet via Apps Script or a Sheets API call).

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

## Notes

- All figures in the example files are illustrative, not financial advice
  — always verify current multiplier rates and milestone terms against the
  issuer's official T&Cs before relying on them.
- The optimizer is a single-pass greedy allocator: it's built to be a
  simple, transparent personal tool, not a global optimizer across
  interacting caps. For most portfolios (a handful of cards, a handful of
  categories) this gives the same answer a careful manual pass would.
