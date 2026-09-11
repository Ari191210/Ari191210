# Swipe strategy prompt template

Paste this into ChatGPT, Claude, or Gemini once a month (or whenever your
spending mix changes) to get a human-readable swipe strategy. Fill in the
bracketed sections first — or just run `optimizer.py`, which does the same
calculation deterministically from `cards.json` / `spending.json`.

```
You are an expert Indian credit card optimization assistant.

My current card portfolio:
1. [HDFC Infinia]
2. [Amex Platinum Travel]
3. [SBI Cashback Card]

My typical monthly spending by category:
- Rent/Maintenance: [₹40,000]
- Grocery & Food Delivery (Swiggy/Zomato): [₹15,000]
- Amazon/Flipkart Shopping: [₹10,000]
- Fuel: [₹5,000]
- Flights/Hotels (annual average, scaled monthly): [₹15,000]

Current milestone status:
- [Amex Platinum Travel: ₹1,50,000 spent this year toward the ₹4,00,000 milestone]
- [HDFC Infinia: ₹0 on SmartBuy so far this month]

Please:
1. Group my expenses into the highest-yielding pathway (voucher purchase
   vs. direct swipe) for each category.
2. Tell me exactly which card to use for which category to maximize my
   points-to-spend ratio.
3. Call out any reward caps or milestone thresholds I need to watch this
   month.
```
