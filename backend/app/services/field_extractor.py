import re


FIELD_LABELS = [
    "Device Name",
    "Trade/Device Name",
    "Manufacturer",
    "Intended Use",
    "Indications for Use",
    "Risk Class",
    "Regulatory Class",
    "Predicate Device",
    "Regulation Number",
    "Regulation Name",
    "Product Code",
    "Dated",
    "Received",
]


def label_pattern(label: str) -> str:
    return r"\s+".join(re.escape(part) for part in label.split())


def clean_value(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" :-")


def find_labeled_field(labels: list[str], text: str) -> str | None:
    labels_regex = "|".join(label_pattern(label) for label in labels)
    stop_labels_regex = "|".join(label_pattern(label) for label in FIELD_LABELS)

    pattern = rf"(?:{labels_regex})\s*:\s*(.*?)(?=\s+(?:{stop_labels_regex})\s*:|$)"
    match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
    if not match:
        return None

    value = clean_value(match.group(1))
    return value or None


def extract_regulatory_fields(text: str) -> dict:
    """
    Very simple placeholder extractor.
    Later, Strands will replace or improve this.
    """

    fields = {
        "device_name": find_labeled_field(["Trade/Device Name", "Device Name"], text),
        "manufacturer": find_labeled_field(["Manufacturer"], text),
        "intended_use": find_labeled_field(["Intended Use", "Indications for Use"], text),
        "risk_class": find_labeled_field(["Risk Class", "Regulatory Class"], text),
        "predicate_device": find_labeled_field(["Predicate Device"], text),
    }

    missing_fields = [
        key for key, value in fields.items()
        if value is None or value == ""
    ]

    return {
        "fields": fields,
        "missing_fields": missing_fields,
        "completion_score": round(
            ((len(fields) - len(missing_fields)) / len(fields)) * 100
        )
    }
