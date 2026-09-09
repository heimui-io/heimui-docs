/**
 * Merges a HeimUI screen with a payload.
 *
 * This is a reference implementation. The semantics are not defined here -- they are defined by the
 * hydration corpus, a set of JSON cases published alongside the schema, which every implementation
 * runs. If this file and the corpus disagree, the corpus is right.
 *
 * Two rules are worth stating before the code, because they are the two that get ported wrong:
 *
 * - `{{state.*}}` is not yours. The SDK resolves it on the device against form state; resolving it
 *   here turns a user's typing into an empty string in the submitted payload.
 * - `metadata` survives hydration. It carries the release identity a host app reports to analytics,
 *   and dropping it leaves the system unable to say which version of a screen a user saw.
 *
 * No dependencies. Runs on any Node with ESM.
 */

const RESERVED_NAMESPACE = 'state';
const EXPRESSION = /\{\{\s*([^{}]+?)\s*\}\}/g;
const CHILD_BUCKETS = ['items', 'children'];
const VARIANT_FALLBACK = '*';

/** Absent, as distinct from present and null. Conflating the two is a reporting bug. */
const MISSING = Symbol('missing');

/** What is left behind where an expression resolved to nothing. Both policies report. */
export const UnresolvedPolicy = Object.freeze({ KEEP: 'keep', BLANK: 'blank' });

// ------------------------------------------------------------------ entry points

/**
 * @returns {{ document: object, unresolved: {nodeId: string, property: string, expression: string}[] }}
 */
export function hydrateWithReport(screen, data, policy = UnresolvedPolicy.KEEP) {
  const ctx = { policy, legacyBindings: legacyBindingsOf(screen), unresolved: [] };
  if (!Object.prototype.hasOwnProperty.call(screen, 'root')) {
    return { document: screen, unresolved: [] };
  }

  const hydratedRoot = hydrateNode(screen.root, [], data, ctx, '');

  // Everything the author wrote travels unchanged, except the declared contract: that is
  // authoring-time information and a device has no use for it.
  const document = {};
  for (const [key, value] of Object.entries(screen)) {
    if (key !== 'data' && key !== 'root') document[key] = value;
  }
  document.root = hydratedRoot;
  return { document, unresolved: ctx.unresolved };
}

export function hydrate(screen, data, policy = UnresolvedPolicy.KEEP) {
  return hydrateWithReport(screen, data, policy).document;
}

// ------------------------------------------------------------------ walk

function hydrateNode(node, frames, data, ctx, stateScope) {
  if (typeof node === 'string') return interpolate(node, frames, data, ctx, '', '');
  if (Array.isArray(node)) return node.map((item) => hydrateNode(item, frames, data, ctx, stateScope));
  if (node !== null && typeof node === 'object') return hydrateObject(node, frames, data, ctx, stateScope);
  return node;
}

function hydrateObject(node, frames, data, ctx, stateScope) {
  const nodeId = isPrimitive(node.id) ? textOf(node.id) : '';

  const declaredScope = readBinding(node.scope);
  const scope = declaredScope ?? legacyScope(node, frames, data, ctx);
  let localFrames = frames;
  if (scope) {
    const value = resolveSource(scope.source, frames, data);
    if (isPlainObject(value)) {
      const aliases = declaredScope ? [scope.alias] : legacyAliases(scope.source);
      localFrames = [...frames, { aliases, value, own: value }];
    }
  }

  const declaredRepeat = readBinding(node.repeat);
  const repeat = declaredRepeat ?? legacyRepeat(node, frames, data, ctx);
  const bucket = repeat ? bucketOf(node) : null;

  const result = {};
  let expandedBucket = null;

  if (repeat && bucket) {
    const authored = Array.isArray(node[bucket]) ? node[bucket] : [];

    // Everything that is not a mould is content, not template. Replacing the whole bucket with the
    // expansion deletes it -- a footer, a "see all" link -- with no error anywhere.
    const { moulds, content } = splitMoulds(authored, repeat);
    const trailing = content.map((c) => hydrateNode(c, localFrames, data, ctx, stateScope));

    const resolved = resolveSource(repeat.source, frames, data);
    const collection = Array.isArray(resolved) ? resolved : null;
    const aliases = declaredRepeat ? [repeat.alias] : legacyAliases(repeat.source);

    let expansion = [];
    if (moulds.length === 0) {
      expansion = [];
    } else if (collection === null || collection.length === 0) {
      if (repeat.empty !== MISSING) {
        expansion = [hydrateNode(repeat.empty, localFrames, data, ctx, stateScope)];
      }
    } else {
      collection.forEach((item, index) => {
        // A list of one shape has one mould; a feed of products, banners and separators picks the
        // one whose variant matches. An entry no mould claims is left out rather than drawn with
        // the wrong template.
        const mould = mouldFor(moulds, repeat, item);
        if (mould === null) return;
        // Only a row that writes form state needs a namespace; a catalogue of product cards would
        // be paying bytes for nothing.
        const scoped = holdsFormState(mould);
        const itemScope = scopeForItem(stateScope, repeat.source, item, index);
        let copy = stripVariant(
          hydrateNode(
            mould,
            [...localFrames, { aliases, value: asFrameValue(item), own: item }],
            data,
            ctx,
            scoped ? itemScope : stateScope,
          ),
        );
        if (scoped && isPlainObject(copy)) copy = { ...copy, state_scope: itemScope };
        expansion.push(copy);
      });
    }

    result[bucket] = [...expansion, ...trailing];
    expandedBucket = bucket;
  }

  for (const [key, value] of Object.entries(node)) {
    // Authoring-time keys never reach a device.
    if (key === 'repeat' || key === 'scope') continue;
    // Already expanded above; walking it again would report the same unresolved expression twice
    // and substitute into text hydration itself produced.
    if (key === expandedBucket) continue;
    result[key] =
      typeof value === 'string'
        ? interpolate(value, localFrames, data, ctx, nodeId, key)
        : hydrateNode(value, localFrames, data, ctx, stateScope);
  }

  // Key order follows the authored document, with the expanded bucket back in its place.
  if (expandedBucket !== null) {
    const ordered = {};
    for (const key of Object.keys(node)) {
      if (key === 'repeat' || key === 'scope') continue;
      if (key in result) ordered[key] = result[key];
    }
    return ordered;
  }
  return result;
}

function bucketOf(node) {
  return CHILD_BUCKETS.find((bucket) => Array.isArray(node[bucket])) ?? null;
}

/**
 * Whether anything under here writes to form state.
 *
 * The namespace exists to tell three `full_name` inputs apart, not to decorate every list.
 */
function holdsFormState(node) {
  if (Array.isArray(node)) return node.some(holdsFormState);
  if (isPlainObject(node)) {
    if (isPrimitive(node.state_key) && textOf(node.state_key).trim() !== '') return true;
    return Object.values(node).some(holdsFormState);
  }
  return false;
}

/**
 * What one row is called, for the state it owns.
 *
 * The item's own `id` when it has one, because a list that reorders must not hand row three's
 * half-typed answer to row one. An index is the fallback, and it is only as stable as the order.
 */
function scopeForItem(parentScope, source, item, index) {
  const identity = isPlainObject(item) && isPrimitive(item.id) ? textOf(item.id) : String(index);
  const own = `${source}/${identity}`;
  return parentScope === '' ? own : `${parentScope}/${own}`;
}

function asFrameValue(item) {
  return isPlainObject(item) ? item : { value: item };
}

// ------------------------------------------------------------------ expressions

function interpolate(raw, frames, data, ctx, nodeId, property) {
  if (!raw.includes('{{')) return raw;

  return raw.replace(EXPRESSION, (whole, captured) => {
    const path = captured.trim();
    // The device owns this one.
    if (path === RESERVED_NAMESPACE || path.startsWith(`${RESERVED_NAMESPACE}.`)) return whole;

    const value = resolveExpression(path, frames, data);
    // Absent is a mistake worth reporting. Present and null is the backend saying "there is no
    // badge on this product", which is an answer, and rendering the literal word `null` on a
    // device is the old way of getting that wrong.
    if (value === MISSING) {
      ctx.unresolved.push({ nodeId, property, expression: path });
      return ctx.policy === UnresolvedPolicy.BLANK ? '' : whole;
    }
    if (value === null) return '';
    return textOf(value);
  });
}

/**
 * A name resolves in the innermost frame that introduces it, then against the payload root.
 *
 * Innermost-first is what makes a list inside a list work: both moulds can call their item `item`
 * without the outer one winning.
 */
function resolveExpression(path, frames, data) {
  const dot = path.indexOf('.');
  const head = dot === -1 ? path : path.slice(0, dot);
  const tail = dot === -1 ? '' : path.slice(dot + 1);

  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const frame = frames[i];
    if (!frame.aliases.includes(head)) continue;
    return tail === '' ? frame.own : readDotted(frame.value, tail);
  }

  // A bare name inside a frame means a field of that frame: `{{ name }}` in a product mould.
  if (tail === '') {
    for (let i = frames.length - 1; i >= 0; i -= 1) {
      const found = readDotted(frames[i].value, head);
      if (found !== MISSING) return found;
    }
  }

  return readDotted(data, path);
}

/** Where a `source` points: a field of an enclosing frame first, the payload root otherwise. */
function resolveSource(source, frames, data) {
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const found = readDotted(frames[i].value, source);
    if (found !== MISSING) return found;
  }
  return readDotted(data, source);
}

/** Fields may be dotted (`brand.name`), which is how a nested object is addressed. */
function readDotted(source, fieldPath) {
  let current = source;
  for (const segment of fieldPath.split('.')) {
    if (!isPlainObject(current) || !Object.prototype.hasOwnProperty.call(current, segment)) return MISSING;
    current = current[segment];
  }
  return current;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPrimitive(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * A value as it appears inside a string.
 *
 * One caveat that is JavaScript's and not this contract's: JSON `3.0` parses to the number 3, and
 * `String(3)` is "3" where other languages render "3.0". If your payload carries decimals whose
 * trailing zero matters -- prices, mostly -- send them as strings.
 */
function textOf(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

// ------------------------------------------------------------------ bindings

function readBinding(value) {
  if (!isPlainObject(value)) return null;
  const source = isPrimitive(value.source) ? textOf(value.source).trim() : '';
  const alias = isPrimitive(value.as) ? textOf(value.as).trim() : '';
  if (source === '' || alias === '') return null;
  const match = isPrimitive(value.match) ? textOf(value.match).trim() : '';
  return {
    source,
    alias,
    // `empty` absent and `empty: null` are different documents, so the sentinel is load-bearing.
    empty: Object.prototype.hasOwnProperty.call(value, 'empty') ? value.empty : MISSING,
    match: match === '' ? null : match,
  };
}

function variantOf(node) {
  if (!isPlainObject(node) || !isPrimitive(node.when)) return null;
  const text = textOf(node.when).trim();
  return text === '' ? null : text;
}

/**
 * Splits a repeating container's children into the moulds and the content after them.
 *
 * Without `match` the first child is the only mould, which is what every list written before this
 * does. With it, the moulds are the children that say which value they draw.
 */
function splitMoulds(children, repeat) {
  if (repeat.match === null) {
    return { moulds: children.slice(0, 1), content: children.slice(1) };
  }
  return {
    moulds: children.filter((c) => variantOf(c) !== null),
    content: children.filter((c) => variantOf(c) === null),
  };
}

/** The mould that draws one item, or nothing when the list has a shape no mould claims. */
function mouldFor(moulds, repeat, item) {
  if (repeat.match === null) return moulds[0] ?? null;

  const value = isPlainObject(item) ? readDotted(item, repeat.match) : MISSING;
  const asString = value === MISSING || value === null ? '' : textOf(value);

  return moulds.find((m) => variantOf(m) === asString) ?? moulds.find((m) => variantOf(m) === VARIANT_FALLBACK) ?? null;
}

/** How a mould was chosen is not something a device has any use for. */
function stripVariant(node) {
  if (!isPlainObject(node) || !('when' in node)) return node;
  const { when, ...rest } = node;
  return rest;
}

// ------------------------------------------------------------------ legacy
//
// Everything below reads `metadata.bindings`, the shape screens had before the binding contract
// existed: it mapped a component id to a collection key and left the rest implied. Delete this
// section if your screens were all authored against the contract -- nothing above depends on it.

function legacyBindingsOf(screen) {
  const bindings = screen?.metadata?.bindings;
  if (!isPlainObject(bindings)) return {};
  return Object.fromEntries(Object.entries(bindings).filter(([, v]) => typeof v === 'string'));
}

function legacyKey(node, ctx) {
  if (typeof node.id !== 'string') return null;
  const key = ctx.legacyBindings[node.id];
  return typeof key === 'string' && key.trim() !== '' ? key.trim() : null;
}

function legacyRepeat(node, frames, data, ctx) {
  const key = legacyKey(node, ctx);
  if (key === null) return null;
  const resolved = resolveSource(key, frames, data);
  return Array.isArray(resolved) ? { source: key, alias: legacyAliases(key)[0], empty: MISSING, match: null } : null;
}

function legacyScope(node, frames, data, ctx) {
  const key = legacyKey(node, ctx);
  if (key === null) return null;
  const resolved = resolveSource(key, frames, data);
  return isPlainObject(resolved) ? { source: key, alias: legacyAliases(key)[0], empty: MISSING, match: null } : null;
}

/**
 * Every name an unmigrated screen might be using for one item of `key`.
 *
 * Generous on purpose. These screens were authored against a rule nobody wrote down, so the only
 * safe reading of them is to accept every name that rule could have produced. New bindings declare
 * their name and get exactly one.
 */
function legacyAliases(key) {
  if (key.trim() === '') return ['item'];
  const clean = cleanCollectionKey(key);
  const last = clean.includes('_') ? clean.slice(clean.lastIndexOf('_') + 1) : clean;
  const candidates = [singularise(last), singularise(clean), clean, key, 'item', 'it'];
  return [...new Set(candidates.filter((c) => c && c.trim() !== ''))];
}

function cleanCollectionKey(key) {
  for (const suffix of ['_list', '_items', '_array']) {
    if (key.endsWith(suffix)) key = key.slice(0, -suffix.length);
  }
  return key;
}

function singularise(word) {
  const lower = word.toLowerCase();
  if (lower.endsWith('ies') && lower.length > 4) return `${lower.slice(0, -3)}y`;
  if (/(shes|ches|sses|xes)$/.test(lower)) return lower.slice(0, -2);
  if (lower.endsWith('s') && !lower.endsWith('ss') && lower.length > 2) return lower.slice(0, -1);
  return lower === '' ? 'item' : lower;
}
