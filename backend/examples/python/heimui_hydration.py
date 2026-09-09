"""
Merges a HeimUI screen with a payload.

This is a reference implementation. The semantics are not defined here -- they are defined by the
hydration corpus, a set of JSON cases published alongside the schema, which every implementation
runs. If this file and the corpus disagree, the corpus is right.

Two rules are worth stating before the code, because they are the two that get ported wrong:

- `{{state.*}}` is not yours. The SDK resolves it on the device against form state; resolving it
  here turns a user's typing into an empty string in the submitted payload.
- `metadata` survives hydration. It carries the release identity a host app reports to analytics,
  and dropping it leaves the system unable to say which version of a screen a user saw.

Standard library only, Python 3.9+.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, List, Optional, Sequence, Tuple

__all__ = [
    "hydrate",
    "hydrate_with_report",
    "HydrationResult",
    "UnresolvedExpression",
    "UnresolvedPolicy",
]

RESERVED_NAMESPACE = "state"
_EXPRESSION = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")
_CHILD_BUCKETS = ("items", "children")
_VARIANT_FALLBACK = "*"


class _Missing:
    """Absent, as distinct from present and null. Conflating the two is a reporting bug."""

    __slots__ = ()

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return "<missing>"


MISSING = _Missing()


class UnresolvedPolicy(Enum):
    """What is left behind where an expression resolved to nothing. Both policies report."""

    KEEP = "keep"
    BLANK = "blank"


@dataclass(frozen=True)
class UnresolvedExpression:
    """
    An expression that resolved to nothing.

    Reported rather than swallowed. A literal `{{ product.name }}` reaching a user is the failure
    the binding contract exists to prevent, and an engine that leaves the braces in place without
    telling anyone means the first report comes from a screenshot.
    """

    node_id: str
    property: str
    expression: str


@dataclass(frozen=True)
class HydrationResult:
    document: dict
    unresolved: List[UnresolvedExpression]


@dataclass(frozen=True)
class _Frame:
    """A name introduced by a `repeat` or a `scope`, in force for one subtree."""

    aliases: Tuple[str, ...]
    value: dict
    # The item itself, which matters when a collection holds primitives: a list of tags is bound
    # with `{{ tag }}`, and there is no field to read.
    own: Any


@dataclass
class _Context:
    policy: UnresolvedPolicy
    legacy_bindings: dict
    unresolved: List[UnresolvedExpression] = field(default_factory=list)


@dataclass(frozen=True)
class _Binding:
    source: str
    alias: str
    empty: Any
    # The item field that decides which mould draws it. A field name rather than an expression, so
    # an editor can check it against a declared contract and say which entries no mould claims.
    match: Optional[str] = None


# ----------------------------------------------------------------------------- entry points


def hydrate_with_report(
    screen: dict,
    data: dict,
    policy: UnresolvedPolicy = UnresolvedPolicy.KEEP,
) -> HydrationResult:
    ctx = _Context(policy, _legacy_bindings_of(screen))
    if "root" not in screen:
        return HydrationResult(screen, [])

    hydrated_root = _hydrate_node(screen["root"], (), data, ctx, "")

    # Everything the author wrote travels unchanged, except the declared contract: that is
    # authoring-time information and a device has no use for it.
    out = {k: v for k, v in screen.items() if k not in ("data", "root")}
    out["root"] = hydrated_root
    return HydrationResult(out, list(ctx.unresolved))


def hydrate(screen: dict, data: dict, policy: UnresolvedPolicy = UnresolvedPolicy.KEEP) -> dict:
    return hydrate_with_report(screen, data, policy).document


# ----------------------------------------------------------------------------- walk


def _hydrate_node(node: Any, frames: Sequence[_Frame], data: dict, ctx: _Context, state_scope: str) -> Any:
    if isinstance(node, str):
        return _interpolate(node, frames, data, ctx, "", "")
    if isinstance(node, list):
        return [_hydrate_node(item, frames, data, ctx, state_scope) for item in node]
    if isinstance(node, dict):
        return _hydrate_object(node, frames, data, ctx, state_scope)
    return node


def _hydrate_object(node: dict, frames: Sequence[_Frame], data: dict, ctx: _Context, state_scope: str) -> dict:
    node_id = _text_of(node.get("id")) if isinstance(node.get("id"), (str, int, float, bool)) else ""

    declared_scope = _read_binding(node.get("scope"))
    scope = declared_scope or _legacy_scope(node, frames, data, ctx)
    local_frames = tuple(frames)
    if scope is not None:
        value = _resolve_source(scope.source, frames, data)
        if isinstance(value, dict):
            aliases = (scope.alias,) if declared_scope is not None else tuple(_legacy_aliases(scope.source))
            local_frames = local_frames + (_Frame(aliases, value, value),)

    declared_repeat = _read_binding(node.get("repeat"))
    repeat = declared_repeat or _legacy_repeat(node, frames, data, ctx)
    bucket = _bucket_of(node) if repeat is not None else None

    result: dict = {}
    expanded_bucket: Optional[str] = None

    if repeat is not None and bucket is not None:
        authored = node.get(bucket)
        authored = authored if isinstance(authored, list) else []

        # Everything that is not a mould is content, not template. Replacing the whole bucket with
        # the expansion deletes it -- a footer, a "see all" link -- with no error anywhere.
        moulds, content = _split_moulds(authored, repeat)
        trailing = [_hydrate_node(c, local_frames, data, ctx, state_scope) for c in content]

        collection = _resolve_source(repeat.source, frames, data)
        collection = collection if isinstance(collection, list) else None
        aliases = (repeat.alias,) if declared_repeat is not None else tuple(_legacy_aliases(repeat.source))

        expansion: List[Any] = []
        if not moulds:
            expansion = []
        elif collection is None or len(collection) == 0:
            if repeat.empty is not MISSING:
                expansion = [_hydrate_node(repeat.empty, local_frames, data, ctx, state_scope)]
        else:
            for index, item in enumerate(collection):
                # A list of one shape has one mould; a feed of products, banners and separators
                # picks the one whose variant matches. An entry no mould claims is left out rather
                # than drawn with the wrong template.
                mould = _mould_for(moulds, repeat, item)
                if mould is None:
                    continue
                # Only a row that writes form state needs a namespace; a catalogue of product cards
                # would be paying bytes for nothing.
                scoped = _holds_form_state(mould)
                item_scope = _scope_for_item(state_scope, repeat.source, item, index)
                copy = _strip_variant(
                    _hydrate_node(
                        mould,
                        local_frames + (_Frame(aliases, _as_frame_value(item), item),),
                        data,
                        ctx,
                        item_scope if scoped else state_scope,
                    )
                )
                if scoped and isinstance(copy, dict):
                    copy = {**copy, "state_scope": item_scope}
                expansion.append(copy)

        result[bucket] = expansion + trailing
        expanded_bucket = bucket

    for key, value in node.items():
        # Authoring-time keys never reach a device.
        if key in ("repeat", "scope"):
            continue
        # Already expanded above; walking it again would report the same unresolved expression
        # twice and substitute into text hydration itself produced.
        if key == expanded_bucket:
            continue
        if isinstance(value, str):
            result[key] = _interpolate(value, local_frames, data, ctx, node_id, key)
        else:
            result[key] = _hydrate_node(value, local_frames, data, ctx, state_scope)

    # Key order follows the authored document, with the expanded bucket back in its place.
    if expanded_bucket is not None:
        return {key: result[key] for key in node.keys() if key not in ("repeat", "scope") and key in result}
    return result


def _bucket_of(node: dict) -> Optional[str]:
    for bucket in _CHILD_BUCKETS:
        if isinstance(node.get(bucket), list):
            return bucket
    return None


def _holds_form_state(node: Any) -> bool:
    """
    Whether anything under here writes to form state.

    The namespace exists to tell three `full_name` inputs apart, not to decorate every list.
    """
    if isinstance(node, dict):
        own = node.get("state_key")
        if isinstance(own, (str, int, float, bool)) and _text_of(own).strip():
            return True
        return any(_holds_form_state(v) for v in node.values())
    if isinstance(node, list):
        return any(_holds_form_state(v) for v in node)
    return False


def _scope_for_item(parent_scope: str, source: str, item: Any, index: int) -> str:
    """
    What one row is called, for the state it owns.

    The item's own `id` when it has one, because a list that reorders must not hand row three's
    half-typed answer to row one. An index is the fallback, and it is only as stable as the order.
    """
    identity = None
    if isinstance(item, dict):
        raw = item.get("id")
        if isinstance(raw, (str, int, float, bool)):
            identity = _text_of(raw)
    if identity is None:
        identity = str(index)
    own = f"{source}/{identity}"
    return own if not parent_scope else f"{parent_scope}/{own}"


def _as_frame_value(item: Any) -> dict:
    return item if isinstance(item, dict) else {"value": item}


# ----------------------------------------------------------------------------- expressions


def _interpolate(
    raw: str,
    frames: Sequence[_Frame],
    data: dict,
    ctx: _Context,
    node_id: str,
    prop: str,
) -> str:
    if "{{" not in raw:
        return raw

    def replace(match: "re.Match[str]") -> str:
        path = match.group(1).strip()
        # The device owns this one.
        if path == RESERVED_NAMESPACE or path.startswith(RESERVED_NAMESPACE + "."):
            return match.group(0)

        value = _resolve_expression(path, frames, data)
        # Absent is a mistake worth reporting. Present and null is the backend saying "there is no
        # badge on this product", which is an answer, and rendering the literal word `null` on a
        # device is the old way of getting that wrong.
        if value is MISSING:
            ctx.unresolved.append(UnresolvedExpression(node_id, prop, path))
            return "" if ctx.policy is UnresolvedPolicy.BLANK else match.group(0)
        if value is None:
            return ""
        return _text_of(value)

    return _EXPRESSION.sub(replace, raw)


def _resolve_expression(path: str, frames: Sequence[_Frame], data: dict) -> Any:
    """
    A name resolves in the innermost frame that introduces it, then against the payload root.

    Innermost-first is what makes a list inside a list work: both moulds can call their item `item`
    without the outer one winning.
    """
    dot = path.find(".")
    head = path if dot == -1 else path[:dot]
    tail = "" if dot == -1 else path[dot + 1 :]

    for frame in reversed(frames):
        if head not in frame.aliases:
            continue
        return frame.own if not tail else _read_dotted(frame.value, tail)

    # A bare name inside a frame means a field of that frame: `{{ name }}` in a product mould.
    if not tail:
        for frame in reversed(frames):
            found = _read_dotted(frame.value, head)
            if found is not MISSING:
                return found

    return _read_dotted(data, path)


def _resolve_source(source: str, frames: Sequence[_Frame], data: dict) -> Any:
    """Where a `source` points: a field of an enclosing frame first, the payload root otherwise."""
    for frame in reversed(frames):
        found = _read_dotted(frame.value, source)
        if found is not MISSING:
            return found
    return _read_dotted(data, source)


def _read_dotted(source: Any, field_path: str) -> Any:
    """Fields may be dotted (`brand.name`), which is how a nested object is addressed."""
    current: Any = source
    for segment in field_path.split("."):
        if not isinstance(current, dict) or segment not in current:
            return MISSING
        current = current[segment]
    return current


def _text_of(value: Any) -> str:
    if value is None:
        return ""
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        return repr(value) if isinstance(value, float) else str(value)
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


# ----------------------------------------------------------------------------- bindings


def _read_binding(value: Any) -> Optional[_Binding]:
    if not isinstance(value, dict):
        return None
    source = _text_of(value.get("source")).strip() if value.get("source") is not None else ""
    alias = _text_of(value.get("as")).strip() if value.get("as") is not None else ""
    if not source or not alias:
        return None
    match = _text_of(value.get("match")).strip() if value.get("match") is not None else ""
    return _Binding(source, alias, value.get("empty", MISSING), match or None)


def _variant_of(node: Any) -> Optional[str]:
    if not isinstance(node, dict):
        return None
    raw = node.get("when")
    if not isinstance(raw, (str, int, float, bool)):
        return None
    text = _text_of(raw).strip()
    return text or None


def _split_moulds(children: Sequence[Any], repeat: _Binding) -> Tuple[List[Any], List[Any]]:
    """
    Splits a repeating container's children into the moulds and the content after them.

    Without `match` the first child is the only mould, which is what every list written before this
    does. With it, the moulds are the children that say which value they draw.
    """
    if repeat.match is None:
        return list(children[:1]), list(children[1:])
    moulds = [c for c in children if _variant_of(c) is not None]
    content = [c for c in children if _variant_of(c) is None]
    return moulds, content


def _mould_for(moulds: Sequence[Any], repeat: _Binding, item: Any) -> Any:
    """The mould that draws one item, or nothing when the list has a shape no mould claims."""
    if repeat.match is None:
        return moulds[0] if moulds else None

    value = _read_dotted(item, repeat.match) if isinstance(item, dict) else MISSING
    as_string = "" if value is MISSING or value is None else _text_of(value)

    for mould in moulds:
        if _variant_of(mould) == as_string:
            return mould
    for mould in moulds:
        if _variant_of(mould) == _VARIANT_FALLBACK:
            return mould
    return None


def _strip_variant(node: Any) -> Any:
    """How a mould was chosen is not something a device has any use for."""
    if isinstance(node, dict) and "when" in node:
        return {k: v for k, v in node.items() if k != "when"}
    return node


# ----------------------------------------------------------------------------- legacy
#
# Everything below reads `metadata.bindings`, the shape screens had before the binding contract
# existed: it mapped a component id to a collection key and left the rest implied. Delete this
# section if your screens were all authored against the contract -- nothing above depends on it.


def _legacy_bindings_of(screen: dict) -> dict:
    metadata = screen.get("metadata")
    if not isinstance(metadata, dict):
        return {}
    bindings = metadata.get("bindings")
    if not isinstance(bindings, dict):
        return {}
    return {k: v for k, v in bindings.items() if isinstance(v, str)}


def _legacy_key(node: dict, ctx: _Context) -> Optional[str]:
    node_id = node.get("id")
    if not isinstance(node_id, str):
        return None
    key = ctx.legacy_bindings.get(node_id)
    if not key or not key.strip():
        return None
    return key.strip()


def _legacy_repeat(node: dict, frames: Sequence[_Frame], data: dict, ctx: _Context) -> Optional[_Binding]:
    key = _legacy_key(node, ctx)
    if key is None:
        return None
    resolved = _resolve_source(key, frames, data)
    if isinstance(resolved, list):
        return _Binding(key, _legacy_aliases(key)[0], MISSING)
    return None


def _legacy_scope(node: dict, frames: Sequence[_Frame], data: dict, ctx: _Context) -> Optional[_Binding]:
    key = _legacy_key(node, ctx)
    if key is None:
        return None
    resolved = _resolve_source(key, frames, data)
    if isinstance(resolved, dict):
        return _Binding(key, _legacy_aliases(key)[0], MISSING)
    return None


def _legacy_aliases(key: str) -> List[str]:
    """
    Every name an unmigrated screen might be using for one item of `key`.

    Generous on purpose. These screens were authored against a rule nobody wrote down, so the only
    safe reading of them is to accept every name that rule could have produced. New bindings
    declare their name and get exactly one.
    """
    if not key.strip():
        return ["item"]
    clean = _clean_collection_key(key)
    last = clean.rsplit("_", 1)[-1]
    candidates = [_singularise(last), _singularise(clean), clean, key, "item", "it"]

    seen = []
    for candidate in candidates:
        if candidate and candidate.strip() and candidate not in seen:
            seen.append(candidate)
    return seen


def _clean_collection_key(key: str) -> str:
    for suffix in ("_list", "_items", "_array"):
        if key.endswith(suffix):
            key = key[: -len(suffix)]
    return key


def _singularise(word: str) -> str:
    lower = word.lower()
    if lower.endswith("ies") and len(lower) > 4:
        return lower[:-3] + "y"
    if re.search(r"(shes|ches|sses|xes)$", lower):
        return lower[:-2]
    if lower.endswith("s") and not lower.endswith("ss") and len(lower) > 2:
        return lower[:-1]
    return lower or "item"
