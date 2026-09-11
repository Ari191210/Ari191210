#!/usr/bin/env python3
"""Credit card points/cashback swipe-strategy optimizer.

Given a JSON file describing your card portfolio (base reward rate, bonus
channels such as SmartBuy/Gyftr vouchers, monthly bonus-spend caps, and
milestone targets) and a JSON file describing this month's spending by
category, computes which card+channel to use for each category to maximize
total reward value, respecting bonus-spend caps, and reports progress
towards each card's milestones.

Usage:
    python optimizer.py --cards cards.json --spending spending.json
    python optimizer.py --cards cards.json --spending spending.json --output json
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Channel:
    rate_percent: float
    monthly_bonus_spend_cap_inr: float | None = None
    notes: str = ""


@dataclass
class Milestone:
    name: str
    period: str
    threshold_spend_inr: float
    current_spend_inr: float
    reward: str


@dataclass
class Card:
    id: str
    name: str
    base_reward_rate_percent: float
    channels: dict[str, Channel] = field(default_factory=dict)
    milestones: list[Milestone] = field(default_factory=list)
    notes: str = ""


@dataclass
class SpendCategory:
    name: str
    amount_inr: float
    channel_by_card: dict[str, str] = field(default_factory=dict)


@dataclass
class Allocation:
    category: str
    amount_inr: float
    card_name: str
    channel_used: str
    effective_rate_percent: float
    value_inr: float


def load_cards(path: Path) -> list[Card]:
    data = json.loads(path.read_text())
    cards = []
    for raw in data.get("cards", []):
        channels = {
            key: Channel(**val) for key, val in raw.get("channels", {}).items()
        }
        milestones = [Milestone(**m) for m in raw.get("milestones", [])]
        cards.append(
            Card(
                id=raw["id"],
                name=raw["name"],
                base_reward_rate_percent=raw["base_reward_rate_percent"],
                channels=channels,
                milestones=milestones,
                notes=raw.get("notes", ""),
            )
        )
    if not cards:
        raise ValueError(f"No cards found in {path}")
    return cards


def load_spending(path: Path) -> tuple[str, list[SpendCategory]]:
    data = json.loads(path.read_text())
    categories = [
        SpendCategory(
            name=c["name"],
            amount_inr=c["amount_inr"],
            channel_by_card=c.get("channel_by_card", {}),
        )
        for c in data.get("categories", [])
    ]
    if not categories:
        raise ValueError(f"No spending categories found in {path}")
    return data.get("month", ""), categories


def best_value_for_card(
    card: Card, category: SpendCategory, cap_used: dict[str, float]
) -> tuple[float, str, float]:
    """Returns (total_value_inr, channel_label, effective_rate_percent) for
    routing this category's full spend through this card, respecting any
    remaining bonus-spend cap on the mapped channel."""
    channel_key = category.channel_by_card.get(card.id)
    channel = card.channels.get(channel_key) if channel_key else None

    if channel is None:
        rate = card.base_reward_rate_percent
        value = category.amount_inr * rate / 100
        return value, "direct swipe", rate

    used_key = f"{card.id}:{channel_key}"
    already_used = cap_used.get(used_key, 0.0)
    if channel.monthly_bonus_spend_cap_inr is not None:
        cap_remaining = max(channel.monthly_bonus_spend_cap_inr - already_used, 0.0)
        bonus_amount = min(category.amount_inr, cap_remaining)
    else:
        bonus_amount = category.amount_inr

    base_amount = category.amount_inr - bonus_amount
    value = (
        bonus_amount * channel.rate_percent / 100
        + base_amount * card.base_reward_rate_percent / 100
    )
    effective_rate = value / category.amount_inr * 100 if category.amount_inr else 0.0
    label = channel_key if bonus_amount > 0 else "direct swipe (cap exhausted)"
    return value, label, effective_rate


def optimize(
    cards: list[Card], categories: list[SpendCategory]
) -> tuple[list[Allocation], dict[str, float]]:
    cards_by_id = {c.id: c for c in cards}

    # Allocate highest-value opportunities first so limited monthly bonus
    # caps go to the categories that benefit from them the most.
    def best_possible_rate(category: SpendCategory) -> float:
        return max(
            best_value_for_card(card, category, {})[2] for card in cards
        )

    ordered = sorted(categories, key=best_possible_rate, reverse=True)

    cap_used: dict[str, float] = {}
    allocations: list[Allocation] = []
    card_totals: dict[str, float] = {c.id: 0.0 for c in cards}

    for category in ordered:
        best_card = None
        best_value = -1.0
        best_channel = ""
        best_rate = 0.0
        for card in cards:
            value, channel_label, rate = best_value_for_card(card, category, cap_used)
            if value > best_value:
                best_card, best_value, best_channel, best_rate = (
                    card,
                    value,
                    channel_label,
                    rate,
                )

        assert best_card is not None
        channel_key = category.channel_by_card.get(best_card.id)
        channel = best_card.channels.get(channel_key) if channel_key else None
        if channel is not None and best_channel not in ("direct swipe (cap exhausted)",):
            used_key = f"{best_card.id}:{channel_key}"
            bonus_amount = min(
                category.amount_inr,
                (
                    max(
                        (channel.monthly_bonus_spend_cap_inr or float("inf"))
                        - cap_used.get(used_key, 0.0),
                        0.0,
                    )
                ),
            )
            cap_used[used_key] = cap_used.get(used_key, 0.0) + bonus_amount

        allocations.append(
            Allocation(
                category=category.name,
                amount_inr=category.amount_inr,
                card_name=best_card.name,
                channel_used=best_channel,
                effective_rate_percent=best_rate,
                value_inr=best_value,
            )
        )
        card_totals[best_card.id] += category.amount_inr

    # Preserve the caller's original category order in the report.
    order_index = {c.name: i for i, c in enumerate(categories)}
    allocations.sort(key=lambda a: order_index[a.category])
    return allocations, card_totals


def milestone_report(cards: list[Card], card_totals: dict[str, float]) -> list[str]:
    lines = []
    for card in cards:
        projected = card_totals.get(card.id, 0.0)
        for m in card.milestones:
            new_total = m.current_spend_inr + projected
            remaining = m.threshold_spend_inr - new_total
            status = (
                f"HIT (surplus ₹{-remaining:,.0f})"
                if remaining <= 0
                else f"₹{remaining:,.0f} remaining"
            )
            lines.append(
                f"  [{card.name}] {m.name} ({m.period}): "
                f"₹{new_total:,.0f} / ₹{m.threshold_spend_inr:,.0f} -> {status} "
                f"| reward: {m.reward}"
            )
    return lines


def render_text(
    month: str,
    allocations: list[Allocation],
    card_totals: dict[str, float],
    cards: list[Card],
) -> str:
    out = [f"Swipe Strategy — {month or 'this month'}", "=" * 60]
    total_value = 0.0
    total_spend = 0.0
    for a in allocations:
        out.append(
            f"- {a.category}: ₹{a.amount_inr:,.0f} -> {a.card_name} "
            f"[{a.channel_used}] @ {a.effective_rate_percent:.2f}% "
            f"(~₹{a.value_inr:,.0f} value)"
        )
        total_value += a.value_inr
        total_spend += a.amount_inr

    blended_rate = (total_value / total_spend * 100) if total_spend else 0.0
    out.append("")
    out.append(
        f"Total spend: ₹{total_spend:,.0f} | Total est. value: ₹{total_value:,.0f} "
        f"| Blended rate: {blended_rate:.2f}%"
    )

    out.append("")
    out.append("Milestone status:")
    milestone_lines = milestone_report(cards, card_totals)
    out.extend(milestone_lines if milestone_lines else ["  (no milestones configured)"])

    notes_lines = [f"  [{c.name}] {c.notes}" for c in cards if c.notes]
    if notes_lines:
        out.append("")
        out.append("Card notes / caveats:")
        out.extend(notes_lines)

    return "\n".join(out)


def render_json(
    month: str,
    allocations: list[Allocation],
    card_totals: dict[str, float],
    cards: list[Card],
) -> str:
    payload = {
        "month": month,
        "allocations": [a.__dict__ for a in allocations],
        "card_totals_inr": card_totals,
        "milestones": milestone_report(cards, card_totals),
        "card_notes": {c.name: c.notes for c in cards if c.notes},
    }
    return json.dumps(payload, indent=2)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cards", type=Path, required=True, help="Path to cards JSON file")
    parser.add_argument(
        "--spending", type=Path, required=True, help="Path to spending JSON file"
    )
    parser.add_argument(
        "--output", choices=["text", "json"], default="text", help="Output format"
    )
    args = parser.parse_args(argv)

    try:
        cards = load_cards(args.cards)
        month, categories = load_spending(args.spending)
    except (OSError, json.JSONDecodeError, KeyError, ValueError) as exc:
        print(f"Error loading input files: {exc}", file=sys.stderr)
        return 1

    allocations, card_totals = optimize(cards, categories)

    if args.output == "json":
        print(render_json(month, allocations, card_totals, cards))
    else:
        print(render_text(month, allocations, card_totals, cards))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
