"""Disposition policy, unchanged from the legacy crop-scan.processor.ts."""

import re

DISCLAIMER = "AI image screening is not a confirmed disease diagnosis. Use follow-up evidence or expert verification before treatment."

_UNKNOWN = re.compile(r"(^|[\s_-])(unknown|unsupported|not[\s_-]?cotton|no[\s_-]?plant)([\s_-]|$)", re.I)


def is_unknown_condition(condition: str) -> bool:
    return bool(_UNKNOWN.search(condition))


def disposition(condition: str, confidence: float, minimum: float, expert_below: float) -> str:
    if is_unknown_condition(condition):
        return "EXPERT_REVIEW_RECOMMENDED"
    if confidence < minimum:
        return "BETTER_IMAGES_REQUIRED"
    if confidence < expert_below:
        return "EXPERT_REVIEW_RECOMMENDED"
    return "SCREENING_COMPLETE"


def status_for(disp: str) -> str:
    return {"BETTER_IMAGES_REQUIRED": "NEEDS_FOLLOW_UP", "EXPERT_REVIEW_RECOMMENDED": "EXPERT_REVIEW"}.get(disp, "DIAGNOSED")
