from __future__ import annotations

import shlex
from dataclasses import dataclass
from ipaddress import ip_address

SUPPORTED_TYPES = {"A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA"}


class BindParseError(ValueError):
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


@dataclass(frozen=True)
class ParsedRecord:
    name: str
    type: str
    value: str
    ttl: int


def _strip_comment(line: str) -> str:
    quoted = False
    escaped = False
    output: list[str] = []
    for char in line:
        if char == '"' and not escaped:
            quoted = not quoted
        if char == ";" and not quoted:
            break
        output.append(char)
        escaped = char == "\\" and not escaped
        if char != "\\":
            escaped = False
    return "".join(output).strip()


def _logical_lines(content: str) -> list[tuple[int, str]]:
    lines: list[tuple[int, str]] = []
    buffer: list[str] = []
    start_line = 1
    depth = 0
    for number, raw in enumerate(content.splitlines(), start=1):
        cleaned = _strip_comment(raw)
        if not cleaned:
            continue
        if not buffer:
            start_line = number
        depth += cleaned.count("(") - cleaned.count(")")
        buffer.append(cleaned.replace("(", " ").replace(")", " "))
        if depth <= 0:
            lines.append((start_line, " ".join(buffer)))
            buffer = []
            depth = 0
    if buffer:
        lines.append((start_line, " ".join(buffer)))
    return lines


def _absolute_name(value: str, origin: str) -> str:
    if value == "@":
        return origin
    return value.lower() if value.endswith(".") else f"{value.lower()}.{origin}"


def _absolute_target(value: str, origin: str) -> str:
    return value if value.endswith(".") else f"{value}.{origin}"


def _normalize_value(record_type: str, values: list[str], origin: str) -> str:
    if record_type in {"CNAME", "NS", "PTR"}:
        if len(values) != 1:
            raise ValueError
        return _absolute_target(values[0], origin)
    if record_type == "A":
        if len(values) != 1 or ip_address(values[0]).version != 4:
            raise ValueError
        return values[0]
    if record_type == "AAAA":
        if len(values) != 1 or ip_address(values[0]).version != 6:
            raise ValueError
        return values[0]
    if record_type == "MX":
        if len(values) != 2 or not values[0].isdigit():
            raise ValueError
        return f"{values[0]} {_absolute_target(values[1], origin)}"
    if record_type == "SRV":
        if len(values) != 4 or not all(value.isdigit() for value in values[:3]):
            raise ValueError
        return " ".join(values[:3] + [_absolute_target(values[3], origin)])
    if record_type == "TXT":
        escaped_values = [value.replace('"', '\\"') for value in values]
        return " ".join(f'"{value}"' for value in escaped_values)
    if record_type == "CAA":
        if len(values) != 3 or not values[0].isdigit() or not 0 <= int(values[0]) <= 255:
            raise ValueError
        return f'{values[0]} {values[1]} "{values[2]}"'
    return " ".join(values)


def parse_bind_zone(content: str, zone_name: str) -> tuple[list[ParsedRecord], list[str]]:
    canonical_zone = zone_name.lower() if zone_name.endswith(".") else f"{zone_name.lower()}."
    origin = canonical_zone
    default_ttl = 300
    previous_owner: str | None = None
    records: list[ParsedRecord] = []
    skipped: list[str] = []
    errors: list[str] = []

    if not content.strip():
        raise BindParseError(["The zone file is empty"])

    for line_number, line in _logical_lines(content):
        try:
            tokens = shlex.split(line, posix=True)
        except ValueError as exc:
            errors.append(f"Line {line_number}: {exc}")
            continue
        if not tokens:
            continue
        directive = tokens[0].upper()
        if directive == "$ORIGIN":
            if len(tokens) != 2:
                errors.append(f"Line {line_number}: $ORIGIN requires one domain name")
            else:
                origin = tokens[1].lower() if tokens[1].endswith(".") else f"{tokens[1].lower()}."
                if origin != canonical_zone:
                    errors.append(f"Line {line_number}: $ORIGIN must match {canonical_zone}")
            continue
        if directive == "$TTL":
            try:
                default_ttl = int(tokens[1])
                if default_ttl < 0:
                    raise ValueError
            except (IndexError, ValueError):
                errors.append(f"Line {line_number}: $TTL must be a non-negative number")
            continue

        type_index = next((index for index, token in enumerate(tokens[1:], start=1) if token.upper() in SUPPORTED_TYPES | {"SOA"}), None)
        if type_index is None and tokens[0].upper() in SUPPORTED_TYPES | {"SOA"}:
            type_index = 0
        if type_index is None:
            errors.append(f"Line {line_number}: unsupported or missing DNS record type")
            continue
        record_type = tokens[type_index].upper()
        prefix = tokens[:type_index]
        values = tokens[type_index + 1 :]
        if not values:
            errors.append(f"Line {line_number}: record value is required")
            continue
        owner_token = next((token for token in prefix if token.upper() != "IN" and not token.isdigit()), None)
        if owner_token:
            owner = _absolute_name(owner_token, origin)
            previous_owner = owner
        elif previous_owner:
            owner = previous_owner
        else:
            errors.append(f"Line {line_number}: record name is required")
            continue
        if owner != canonical_zone and not owner.endswith(f".{canonical_zone}"):
            errors.append(f"Line {line_number}: {owner} is outside this hosted zone")
            continue
        ttl_token = next((token for token in prefix if token.isdigit()), None)
        ttl = int(ttl_token) if ttl_token is not None else default_ttl
        if record_type == "SOA":
            skipped.append(f"Line {line_number}: SOA is managed automatically")
            continue
        try:
            value = _normalize_value(record_type, values, origin)
        except (IndexError, ValueError):
            errors.append(f"Line {line_number}: invalid {record_type} value")
            continue
        records.append(ParsedRecord(owner, record_type, value, ttl))

    if errors:
        raise BindParseError(errors[:25])
    return records, skipped


def format_bind_zone(zone_name: str, records: list[dict]) -> str:
    origin = zone_name if zone_name.endswith(".") else f"{zone_name}."
    output = [f"$ORIGIN {origin}", "$TTL 300", ""]
    for record in records:
        name = record["name"]
        if name == origin:
            owner = "@"
        elif name.endswith(f".{origin}"):
            owner = name[: -(len(origin) + 1)]
        else:
            owner = name
        for value in str(record["value"]).splitlines() or [""]:
            output.append(f"{owner:<28} {record['ttl']:<8} IN  {record['type']:<6} {value}")
    return "\n".join(output) + "\n"
