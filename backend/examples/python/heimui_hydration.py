"""
Merges a HeimUI screen with a payload.

This is a reference implementation. The semantics are not defined here -- they are defined by the
hydration corpus, a set of JSON cases published alongside it, which every implementation runs. If
this file and the corpus disagree, the corpus is right.

Two rules are worth stating before the code, because they are the two that get ported wrong:

- ``{{state.*}}`` is not yours. The SDK resolves it on the device against form state; resolving it
  here turns a user's typing into an empty string in the submitted payload.
- ``metadata`` survives hydration. It carries the release identity a host app reports to analytics,
  and dropping it leaves the system unable to say which version of a screen a user saw.

Standard library only, Python 3.9+.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from enum import Enum
from typing import Any, Iterable, List, NamedTuple, Optional, Sequence, Tuple

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
_AUTHORING_KEYS = frozenset({"repeat", "scope"})


class _Missing:
    """Absent, as distinct from present and null. Conflating the two is a reporting bug."""

    __slots__ = ()

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return "<missing>"


MISSING = _Missing()


class UnresolvedPolicy(Enum):
    """What is left where an expression resolved to nothing. Both policies report."""

    KEEP = "keep"
    BLANK = "blank"


class UnresolvedExpression(NamedTuple):
    """
    An expression that resolved to nothing.

    Reported rather than swallowed. A literal ``{{ product.name }}`` reaching a user is the failure
    the binding contract exists to prevent, and an engine that leaves the braces in place without
    telling anyone means the first report comes from a screenshot.
    """

    node_id: str
    property: str
    expression: str


class HydrationResult(NamedTuple):
    document: dict
    unresolved: List[UnresolvedExpression]


class _Frame(NamedTuple):
    """A name introduced by a ``repeat`` or a ``scope``, in force for one subtree."""

    aliases: Tuple[str, ...]
    value: dict
    # The item itself, which matters when a collection holds primitives: a list of tags is bound
    # with `{{ tag }}`, and there is no field to read.
    own: Any


@dataclass(frozen=True)
class _Binding:
    source: str
    alias: str
    empty: Any
    # The item field that decides which mould draws it. A field name rather than an expression, so
    # an editor can check it against a declared contract and say which entries no mould claims.
    match: Optional[str] = None


Frames = Tuple[_Frame, ...]


# --------------------------------------------------------------------------------- entry points


def hydrate_with_report(
    screen: dict,
    data: dict,
    policy: UnresolvedPolicy = UnresolvedPolicy.KEEP,
) -> HydrationResult:
    if "root" not in screen:
        return HydrationResult(screen, [])

    engine = _Hydrator(data, policy, _legacy_bindings_of(screen))
    root = engine.node(screen["root"], (), "")

    # Everything the author wrote travels unchanged, except the declared contract: that is
    # authoring-time information and a device has no use for it.
    document = {k: v for k, v in screen.items() if k not in ("data", "root")}
    document["root"] = root
    return HydrationResult(document, engine.unresolved)


def hydrate(screen: dict, data: dict, policy: UnresolvedPolicy = UnresolvedPolicy.KEEP) -> dict:
    return hydrate_with_report(screen, data, policy).document


# --------------------------------------------------------------------------------- the walk


class _Hydrator:
    """
    One pass over one screen.

    The payload, the policy and the report are the same for every node, so they live here rather
    than being threaded through every signature.
    """

    def __init__(self, data: dict, policy: UnresolvedPolicy, legacy: dict) -> None:
        self.data = data
        self.policy = policy
        self.legacy = legacy
        self.unresolved: List[UnresolvedExpression] = []

    def node(self, node: Any, frames: Frames, scope: str) -> Any:
        if isinstance(node, str):
            return self.interpolate(node, frames, "", "")
        if isinstance(node, list):
            return [self.node(item, frames, scope) for item in node]
        if isinstance(node, dict):
            return self.obj(node, frames, scope)
        return node

    def obj(self, node: dict, frames: Frames, scope: str) -> dict:
        node_id = _text_of(node.get("id")) if _is_primitive(node.get("id")) else ""
        frames = self._scoped(node, frames)

        declared = _read_binding(node.get("repeat"))
        repeat = declared or self._legacy_binding(node, frames, list)
        bucket = _bucket_of(node) if repeat else None

        result: dict = {}
        if repeat and bucket:
            result[bucket] = self._expand(node, bucket, repeat, declared is not None, frames, scope)

        for key, value in node.items():
            if key in _AUTHORING_KEYS or key == bucket:
                # Authoring keys never reach a device, and walking an expanded bucket again would
                # report the same expression twice and substitute into text this pass produced.
                continue
            result[key] = (
                self.interpolate(value, frames, node_id, key)
                if isinstance(value, str)
                else self.node(value, frames, scope)
            )

        # Key order follows the authored document, with the expanded bucket back in its place.
        return {k: result[k] for k in node if k not in _AUTHORING_KEYS and k in result}

    def _scoped(self, node: dict, frames: Frames) -> Frames:
        """Adds the frame a ``scope`` introduces, if it names an object."""
        declared = _read_binding(node.get("scope"))
        binding = declared or self._legacy_binding(node, frames, dict)
        if binding is None:
            return frames
        value = self.source(binding.source, frames)
        if not isinstance(value, dict):
            return frames
        return frames + (_Frame(_aliases_for(binding, declared is not None), value, value),)

    def _expand(
        self,
        node: dict,
        bucket: str,
        repeat: _Binding,
        declared: bool,
        frames: Frames,
        scope: str,
    ) -> list:
        authored = node[bucket] if isinstance(node.get(bucket), list) else []

        # Everything that is not a mould is content, not template. Replacing the whole bucket with
        # the expansion deletes it -- a footer, a "see all" link -- with no error anywhere.
        moulds, content = _split_moulds(authored, repeat)
        trailing = [self.node(c, frames, scope) for c in content]
        if not moulds:
            return trailing

        collection = self.source(repeat.source, frames)
        if not isinstance(collection, list) or not collection:
            empty = [] if repeat.empty is MISSING else [self.node(repeat.empty, frames, scope)]
            return empty + trailing

        aliases = _aliases_for(repeat, declared)
        return [row for row in self._rows(collection, moulds, repeat, aliases, frames, scope)] + trailing

    def _rows(
        self,
        collection: list,
        moulds: Sequence[Any],
        repeat: _Binding,
        aliases: Tuple[str, ...],
        frames: Frames,
        scope: str,
    ) -> Iterable[Any]:
        for index, item in enumerate(collection):
            # A list of one shape has one mould; a feed of products, banners and separators picks
            # the one whose variant matches. An entry no mould claims is left out rather than drawn
            # with the wrong template.
            mould = _mould_for(moulds, repeat, item)
            if mould is None:
                continue
            # Only a row that writes form state needs a namespace; a catalogue of product cards
            # would be paying bytes for nothing.
            scoped = _holds_form_state(mould)
            row_scope = _scope_for_item(scope, repeat.source, item, index)
            frame = _Frame(aliases, item if isinstance(item, dict) else {"value": item}, item)
            row = _strip_variant(self.node(mould, frames + (frame,), row_scope if scoped else scope))
            yield {**row, "state_scope": row_scope} if scoped and isinstance(row, dict) else row

    # ----------------------------------------------------------------------------- expressions

    def interpolate(self, raw: str, frames: Frames, node_id: str, prop: str) -> str:
        if "{{" not in raw:
            return raw

        def replace(match: "re.Match[str]") -> str:
            path = match.group(1).strip()
            # The device owns this one.
            if path == RESERVED_NAMESPACE or path.startswith(RESERVED_NAMESPACE + "."):
                return match.group(0)

            value = self.resolve(path, frames)
            # Absent is a mistake worth reporting. Present and null is the backend saying "there is
            # no badge on this product", which is an answer, and rendering the literal word `null`
            # on a device is the old way of getting that wrong.
            if value is MISSING:
                self.unresolved.append(UnresolvedExpression(node_id, prop, path))
                return "" if self.policy is UnresolvedPolicy.BLANK else match.group(0)
            return "" if value is None else _text_of(value)

        return _EXPRESSION.sub(replace, raw)

    def resolve(self, path: str, frames: Frames) -> Any:
        """
        A name resolves in the innermost frame that introduces it, then against the payload root.

        Innermost-first is what makes a list inside a list work: both moulds can call their item
        ``item`` without the outer one winning.
        """
        head, _, tail = path.partition(".")

        for frame in reversed(frames):
            if head in frame.aliases:
                return frame.own if not tail else _read_dotted(frame.value, tail)

        # A bare name inside a frame means a field of that frame: `{{ name }}` in a product mould.
        if not tail:
            for frame in reversed(frames):
                found = _read_dotted(frame.value, head)
                if found is not MISSING:
                    return found

        return _read_dotted(self.data, path)

    def source(self, source: str, frames: Frames) -> Any:
        """Where a ``source`` points: a field of an enclosing frame first, the payload root after."""
        for frame in reversed(frames):
            found = _read_dotted(frame.value, source)
            if found is not MISSING:
                return found
        return _read_dotted(self.data, source)

    def _legacy_binding(self, node: dict, frames: Frames, shape: type) -> Optional[_Binding]:
        key = self.legacy.get(node["id"]) if isinstance(node.get("id"), str) else None
        if not key or not key.strip():
            return None
        key = key.strip()
        if not isinstance(self.source(key, frames), shape):
            return None
        return _Binding(key, _legacy_aliases(key)[0], MISSING)


# --------------------------------------------------------------------------------- reading


def _bucket_of(node: dict) -> Optional[str]:
    return next((b for b in _CHILD_BUCKETS if isinstance(node.get(b), list)), None)


def _read_dotted(source: Any, field_path: str) -> Any:
    """Fields may be dotted (``brand.name``), which is how a nested object is addressed."""
    current = source
    for segment in field_path.split("."):
        if not isinstance(current, dict) or segment not in current:
            return MISSING
        current = current[segment]
    return current


def _is_primitive(value: Any) -> bool:
    return isinstance(value, (str, int, float, bool))


def _text_of(value: Any) -> str:
    if value is None:
        return ""
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return value
    if isinstance(value, float):
        return repr(value)
    if isinstance(value, int):
        return str(value)
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def _holds_form_state(node: Any) -> bool:
    """
    Whether anything under here writes to form state.

    The namespace exists to tell three ``full_name`` inputs apart, not to decorate every list.
    """
    if isinstance(node, dict):
        own = node.get("state_key")
        return (_is_primitive(own) and _text_of(own).strip() != "") or any(
            map(_holds_form_state, node.values())
        )
    return isinstance(node, list) and any(map(_holds_form_state, node))


def _scope_for_item(parent: str, source: str, item: Any, index: int) -> str:
    """
    What one row is called, for the state it owns.

    The item's own ``id`` when it has one, because a list that reorders must not hand row three's
    half-typed answer to row one. An index is the fallback, and only as stable as the order.
    """
    identity = item.get("id") if isinstance(item, dict) else None
    own = f"{source}/{_text_of(identity) if _is_primitive(identity) else index}"
    return f"{parent}/{own}" if parent else own


# --------------------------------------------------------------------------------- bindings


def _read_binding(value: Any) -> Optional[_Binding]:
    if not isinstance(value, dict):
        return None
    source = _text_of(value["source"]).strip() if _is_primitive(value.get("source")) else ""
    alias = _text_of(value["as"]).strip() if _is_primitive(value.get("as")) else ""
    if not source or not alias:
        return None
    match = _text_of(value["match"]).strip() if _is_primitive(value.get("match")) else ""
    # `empty` absent and `empty: null` are different documents, so the sentinel is load-bearing.
    return _Binding(source, alias, value.get("empty", MISSING), match or None)


def _aliases_for(binding: _Binding, declared: bool) -> Tuple[str, ...]:
    return (binding.alias,) if declared else tuple(_legacy_aliases(binding.source))


def _variant_of(node: Any) -> Optional[str]:
    if not isinstance(node, dict) or not _is_primitive(node.get("when")):
        return None
    return _text_of(node["when"]).strip() or None


def _split_moulds(children: Sequence[Any], repeat: _Binding) -> Tuple[List[Any], List[Any]]:
    """
    Splits a repeating container's children into the moulds and the content after them.

    Without ``match`` the first child is the only mould, which is what every list written before
    this does. With it, the moulds are the children that say which value they draw.
    """
    if repeat.match is None:
        return list(children[:1]), list(children[1:])
    moulds = [c for c in children if _variant_of(c) is not None]
    return moulds, [c for c in children if _variant_of(c) is None]


def _mould_for(moulds: Sequence[Any], repeat: _Binding, item: Any) -> Any:
    """The mould that draws one item, or nothing when the list has a shape no mould claims."""
    if repeat.match is None:
        return moulds[0] if moulds else None

    value = _read_dotted(item, repeat.match) if isinstance(item, dict) else MISSING
    wanted = "" if value is MISSING or value is None else _text_of(value)

    exact = next((m for m in moulds if _variant_of(m) == wanted), None)
    return exact or next((m for m in moulds if _variant_of(m) == _VARIANT_FALLBACK), None)


def _strip_variant(node: Any) -> Any:
    """How a mould was chosen is not something a device has any use for."""
    if isinstance(node, dict) and "when" in node:
        return {k: v for k, v in node.items() if k != "when"}
    return node


# --------------------------------------------------------------------------------- legacy
#
# Everything below reads `metadata.bindings`, the shape screens had before the binding contract
# existed: it mapped a component id to a collection key and left the rest implied. Delete this
# section if your screens were all authored against the contract -- nothing above needs it beyond
# `_Hydrator._legacy_binding`, which then always returns None.


def _legacy_bindings_of(screen: dict) -> dict:
    bindings = screen.get("metadata", {}).get("bindings") if isinstance(screen.get("metadata"), dict) else None
    if not isinstance(bindings, dict):
        return {}
    return {k: v for k, v in bindings.items() if isinstance(v, str)}


def _legacy_aliases(key: str) -> List[str]:
    """
    Every name an unmigrated screen might be using for one item of ``key``.

    Generous on purpose. These screens were authored against a rule nobody wrote down, so the only
    safe reading of them is to accept every name that rule could have produced. New bindings declare
    their name and get exactly one.
    """
    if not key.strip():
        return ["item"]
    clean = _clean_collection_key(key)
    candidates = [
        _singularise(clean.rsplit("_", 1)[-1]),
        _singularise(clean),
        clean,
        key,
        "item",
        "it",
    ]
    return list(dict.fromkeys(c for c in candidates if c and c.strip()))


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
