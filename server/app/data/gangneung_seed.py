from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


PlaceCategory = Literal[
    "brunch",
    "lunch",
    "dinner",
    "cafe",
    "activity",
    "night-view",
]


@dataclass(frozen=True)
class PlaceSeed:
    id: str
    name: str
    district: str | None
    category: PlaceCategory
    budget_krw: int
    tags: tuple[str, ...]


GANGNEUNG_PLACE_SEEDS: tuple[PlaceSeed, ...] = (
    PlaceSeed(
        id="gangneung-brunch-01",
        name="\ucd08\ub2f9 \ube0c\ub7f0\uce58 \ud14c\uc774\ube14",
        district=None,
        category="brunch",
        budget_krw=16000,
        tags=("romantic", "healing", "brunch"),
    ),
    PlaceSeed(
        id="gangneung-lunch-01",
        name="\ucd08\ub2f9 \uc21c\ub450\ubd80 \uac70\ub9ac",
        district=None,
        category="lunch",
        budget_krw=18000,
        tags=("food", "local", "healing"),
    ),
    PlaceSeed(
        id="gangneung-dinner-01",
        name="\uacbd\ud3ec \uc624\uc158 \ub2e4\uc774\ub2dd",
        district=None,
        category="dinner",
        budget_krw=28000,
        tags=("romantic", "night", "food"),
    ),
    PlaceSeed(
        id="gangneung-cafe-01",
        name="\uc548\ubaa9 \ucee4\ud53c\uac70\ub9ac \uce74\ud398",
        district=None,
        category="cafe",
        budget_krw=12000,
        tags=("cafe", "sea", "romantic"),
    ),
    PlaceSeed(
        id="gangneung-cafe-02",
        name="\uac15\ub989 \uac10\uc131 \ub85c\uc2a4\ud130\ub9ac",
        district=None,
        category="cafe",
        budget_krw=11000,
        tags=("cafe", "healing", "quiet"),
    ),
    PlaceSeed(
        id="gangneung-activity-01",
        name="\uacbd\ud3ec\ud638 \uc0b0\ucc45 \ucf54\uc2a4",
        district=None,
        category="activity",
        budget_krw=0,
        tags=("healing", "walk", "sea"),
    ),
    PlaceSeed(
        id="gangneung-activity-02",
        name="\uc544\ub974\ud14c\ubba4\uc9c0\uc5c4 \uac15\ub989",
        district=None,
        category="activity",
        budget_krw=22000,
        tags=("activity", "indoor", "art"),
    ),
    PlaceSeed(
        id="gangneung-night-01",
        name="\uacbd\ud3ec\ud574\ubcc0 \uc57c\uacbd \uc2a4\ud31f",
        district=None,
        category="night-view",
        budget_krw=4000,
        tags=("night", "sea", "romantic"),
    ),
)
