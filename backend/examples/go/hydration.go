// Package hydration merges a HeimUI screen with a payload.
//
// This is a reference implementation. The semantics are not defined here -- they are defined by the
// hydration corpus, a set of JSON cases published alongside it, which every implementation runs. If
// this file and the corpus disagree, the corpus is right.
//
// Two rules are worth stating before the code, because they are the two that get ported wrong:
//
//   - {{state.*}} is not yours. The SDK resolves it on the device against form state; resolving it
//     here turns a user's typing into an empty string in the submitted payload.
//   - metadata survives hydration. It carries the release identity a host app reports to analytics,
//     and dropping it leaves the system unable to say which version of a screen a user saw.
//
// Standard library only.
package hydration

import (
	"encoding/json"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

const reservedNamespace = "state"
const variantFallback = "*"

var expression = regexp.MustCompile(`\{\{\s*([^{}]+?)\s*\}\}`)
var childBuckets = [...]string{"items", "children"}

// Policy decides what is left where an expression resolved to nothing. Both policies report.
type Policy int

const (
	// Keep leaves the braces in place. Loud, and what a staging environment wants.
	Keep Policy = iota
	// Blank empties them. Quiet, and what production wants.
	Blank
)

// Unresolved is an expression that resolved to nothing.
//
// Reported rather than swallowed. A literal {{ product.name }} reaching a user is the failure the
// binding contract exists to prevent, and an engine that leaves the braces in place without telling
// anyone means the first report comes from a screenshot.
type Unresolved struct {
	NodeID     string
	Property   string
	Expression string
}

// Result is the document a device receives, and everything that went missing on the way.
type Result struct {
	Document   map[string]any
	Unresolved []Unresolved
}

// frame is a name introduced by a repeat or a scope, in force for one subtree.
type frame struct {
	aliases []string
	value   map[string]any
	// own is the item itself, which matters when a collection holds primitives: a list of tags is
	// bound with {{ tag }}, and there is no field to read.
	own any
}

type binding struct {
	source string
	alias  string
	// empty absent and "empty": null are different documents, so presence is tracked separately.
	empty    any
	hasEmpty bool
	// match is the item field that decides which mould draws it. A field name rather than an
	// expression, so an editor can check it against a declared contract and say which entries no
	// mould claims.
	match string
}

// HydrateWithReport merges screen with data.
//
// Note on key order: Go maps do not keep one, and encoding/json sorts keys when it writes. The other
// reference implementations preserve the authored order. Nothing depends on it -- a device reads a
// node by name -- but the bytes will differ from theirs even when the documents are equal.
func HydrateWithReport(screen, data map[string]any, policy Policy) Result {
	root, ok := screen["root"]
	if !ok {
		return Result{Document: screen}
	}

	h := &hydrator{data: data, policy: policy, legacy: legacyBindingsOf(screen)}
	hydrated := h.node(root, nil, "")

	// Everything the author wrote travels unchanged, except the declared contract: that is
	// authoring-time information and a device has no use for it.
	document := make(map[string]any, len(screen))
	for key, value := range screen {
		if key != "data" && key != "root" {
			document[key] = value
		}
	}
	document["root"] = hydrated
	return Result{Document: document, Unresolved: h.unresolved}
}

// Hydrate is HydrateWithReport for callers that handle the report elsewhere.
func Hydrate(screen, data map[string]any, policy Policy) map[string]any {
	return HydrateWithReport(screen, data, policy).Document
}

// hydrator is one pass over one screen. The payload, the policy and the report are the same for
// every node, so they live here rather than being threaded through every signature.
type hydrator struct {
	data       map[string]any
	policy     Policy
	legacy     map[string]string
	unresolved []Unresolved
}

func (h *hydrator) node(n any, frames []frame, scope string) any {
	switch v := n.(type) {
	case string:
		return h.interpolate(v, frames, "", "")
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = h.node(item, frames, scope)
		}
		return out
	case map[string]any:
		return h.object(v, frames, scope)
	default:
		return n
	}
}

func (h *hydrator) object(n map[string]any, frames []frame, scope string) map[string]any {
	nodeID := ""
	if id, ok := n["id"]; ok && isPrimitive(id) {
		nodeID = textOf(id)
	}
	frames = h.scoped(n, frames)

	declared := readBinding(n["repeat"])
	repeat := declared
	if repeat == nil {
		repeat = h.legacyBinding(n, frames, kindList)
	}

	bucket := ""
	if repeat != nil {
		bucket = bucketOf(n)
	}

	result := make(map[string]any, len(n))
	if repeat != nil && bucket != "" {
		result[bucket] = h.expand(n, bucket, repeat, declared != nil, frames, scope)
	}

	for key, value := range n {
		// Authoring keys never reach a device, and walking an expanded bucket again would report
		// the same expression twice and substitute into text this pass produced.
		if key == "repeat" || key == "scope" || key == bucket {
			continue
		}
		if s, ok := value.(string); ok {
			result[key] = h.interpolate(s, frames, nodeID, key)
		} else {
			result[key] = h.node(value, frames, scope)
		}
	}
	return result
}

// scoped adds the frame a scope introduces, if it names an object.
func (h *hydrator) scoped(n map[string]any, frames []frame) []frame {
	declared := readBinding(n["scope"])
	b := declared
	if b == nil {
		b = h.legacyBinding(n, frames, kindObject)
	}
	if b == nil {
		return frames
	}
	value, _ := h.source(b.source, frames)
	obj, ok := value.(map[string]any)
	if !ok {
		return frames
	}
	return append(frames[:len(frames):len(frames)], frame{aliasesFor(b, declared != nil), obj, obj})
}

func (h *hydrator) expand(n map[string]any, bucket string, repeat *binding, declared bool, frames []frame, scope string) []any {
	authored, _ := n[bucket].([]any)

	// Everything that is not a mould is content, not template. Replacing the whole bucket with the
	// expansion deletes it -- a footer, a "see all" link -- with no error anywhere.
	moulds, content := splitMoulds(authored, repeat)
	trailing := make([]any, 0, len(content))
	for _, c := range content {
		trailing = append(trailing, h.node(c, frames, scope))
	}
	if len(moulds) == 0 {
		return trailing
	}

	resolved, _ := h.source(repeat.source, frames)
	collection, _ := resolved.([]any)
	if len(collection) == 0 {
		if !repeat.hasEmpty {
			return trailing
		}
		return append([]any{h.node(repeat.empty, frames, scope)}, trailing...)
	}

	aliases := aliasesFor(repeat, declared)
	rows := make([]any, 0, len(collection)+len(trailing))
	for index, item := range collection {
		// A list of one shape has one mould; a feed of products, banners and separators picks the
		// one whose variant matches. An entry no mould claims is left out rather than drawn with
		// the wrong template.
		mould := mouldFor(moulds, repeat, item)
		if mould == nil {
			continue
		}
		// Only a row that writes form state needs a namespace; a catalogue of product cards would
		// be paying bytes for nothing.
		scoped := holdsFormState(mould)
		rowScope := scopeForItem(scope, repeat.source, item, index)

		value, ok := item.(map[string]any)
		if !ok {
			value = map[string]any{"value": item}
		}
		inner := scope
		if scoped {
			inner = rowScope
		}
		row := stripVariant(h.node(mould, append(frames[:len(frames):len(frames)], frame{aliases, value, item}), inner))
		if obj, ok := row.(map[string]any); ok && scoped {
			obj["state_scope"] = rowScope
		}
		rows = append(rows, row)
	}
	return append(rows, trailing...)
}

// ---------------------------------------------------------------------------------- expressions

func (h *hydrator) interpolate(raw string, frames []frame, nodeID, property string) string {
	if !strings.Contains(raw, "{{") {
		return raw
	}
	return expression.ReplaceAllStringFunc(raw, func(whole string) string {
		path := strings.TrimSpace(expression.FindStringSubmatch(whole)[1])
		// The device owns this one.
		if path == reservedNamespace || strings.HasPrefix(path, reservedNamespace+".") {
			return whole
		}

		value, found := h.resolve(path, frames)
		// Absent is a mistake worth reporting. Present and null is the backend saying "there is no
		// badge on this product", which is an answer, and rendering the literal word null on a
		// device is the old way of getting that wrong.
		if !found {
			h.unresolved = append(h.unresolved, Unresolved{nodeID, property, path})
			if h.policy == Blank {
				return ""
			}
			return whole
		}
		if value == nil {
			return ""
		}
		return textOf(value)
	})
}

// resolve reads a name in the innermost frame that introduces it, then against the payload root.
//
// Innermost-first is what makes a list inside a list work: both moulds can call their item "item"
// without the outer one winning.
func (h *hydrator) resolve(path string, frames []frame) (any, bool) {
	head, tail, _ := strings.Cut(path, ".")

	for i := len(frames) - 1; i >= 0; i-- {
		if !slices.Contains(frames[i].aliases, head) {
			continue
		}
		if tail == "" {
			return frames[i].own, true
		}
		return readDotted(frames[i].value, tail)
	}

	// A bare name inside a frame means a field of that frame: {{ name }} in a product mould.
	if tail == "" {
		for i := len(frames) - 1; i >= 0; i-- {
			if value, ok := readDotted(frames[i].value, head); ok {
				return value, true
			}
		}
	}

	return readDotted(h.data, path)
}

// source is where a binding's source points: a field of an enclosing frame first, the payload root
// otherwise.
func (h *hydrator) source(source string, frames []frame) (any, bool) {
	for i := len(frames) - 1; i >= 0; i-- {
		if value, ok := readDotted(frames[i].value, source); ok {
			return value, true
		}
	}
	return readDotted(h.data, source)
}

// ---------------------------------------------------------------------------------- reading

// readDotted addresses a nested object: fields may be dotted, as in brand.name. The second return
// separates absent from present-and-null, which rule 8 depends on.
func readDotted(source any, fieldPath string) (any, bool) {
	current := source
	for _, segment := range strings.Split(fieldPath, ".") {
		obj, ok := current.(map[string]any)
		if !ok {
			return nil, false
		}
		current, ok = obj[segment]
		if !ok {
			return nil, false
		}
	}
	return current, true
}

func bucketOf(n map[string]any) string {
	for _, bucket := range childBuckets {
		if _, ok := n[bucket].([]any); ok {
			return bucket
		}
	}
	return ""
}

func isPrimitive(value any) bool {
	switch value.(type) {
	case string, float64, bool, int:
		return true
	}
	return false
}

// textOf renders a value as it appears inside a string.
//
// One caveat that is Go's and not this contract's: encoding/json decodes every number as a float64,
// so JSON 3.0 and 3 are indistinguishable and both render "3". If a decimal's trailing zero matters
// -- prices, mostly -- send it as a string.
func textOf(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return v
	case bool:
		return strconv.FormatBool(v)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	default:
		encoded, err := json.Marshal(v)
		if err != nil {
			return ""
		}
		return string(encoded)
	}
}

// holdsFormState reports whether anything under here writes to form state.
//
// The namespace exists to tell three full_name inputs apart, not to decorate every list.
func holdsFormState(n any) bool {
	switch v := n.(type) {
	case map[string]any:
		if key, ok := v["state_key"]; ok && isPrimitive(key) && strings.TrimSpace(textOf(key)) != "" {
			return true
		}
		for _, value := range v {
			if holdsFormState(value) {
				return true
			}
		}
	case []any:
		for _, value := range v {
			if holdsFormState(value) {
				return true
			}
		}
	}
	return false
}

// scopeForItem names one row, for the state it owns.
//
// The item's own id when it has one, because a list that reorders must not hand row three's
// half-typed answer to row one. An index is the fallback, and only as stable as the order.
func scopeForItem(parent, source string, item any, index int) string {
	identity := strconv.Itoa(index)
	if obj, ok := item.(map[string]any); ok {
		if id, ok := obj["id"]; ok && isPrimitive(id) {
			identity = textOf(id)
		}
	}
	own := source + "/" + identity
	if parent == "" {
		return own
	}
	return parent + "/" + own
}

// ---------------------------------------------------------------------------------- bindings

func readBinding(value any) *binding {
	obj, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	source := trimmedField(obj, "source")
	alias := trimmedField(obj, "as")
	if source == "" || alias == "" {
		return nil
	}
	empty, hasEmpty := obj["empty"]
	return &binding{source: source, alias: alias, empty: empty, hasEmpty: hasEmpty, match: trimmedField(obj, "match")}
}

func trimmedField(obj map[string]any, key string) string {
	value, ok := obj[key]
	if !ok || !isPrimitive(value) {
		return ""
	}
	return strings.TrimSpace(textOf(value))
}

func aliasesFor(b *binding, declared bool) []string {
	if declared {
		return []string{b.alias}
	}
	return legacyAliases(b.source)
}

func variantOf(n any) string {
	obj, ok := n.(map[string]any)
	if !ok {
		return ""
	}
	return trimmedField(obj, "when")
}

// splitMoulds separates a repeating container's children into the moulds and the content after them.
//
// Without match the first child is the only mould, which is what every list written before this
// does. With it, the moulds are the children that say which value they draw.
func splitMoulds(children []any, repeat *binding) (moulds, content []any) {
	if repeat.match == "" {
		if len(children) == 0 {
			return nil, nil
		}
		return children[:1], children[1:]
	}
	for _, child := range children {
		if variantOf(child) != "" {
			moulds = append(moulds, child)
		} else {
			content = append(content, child)
		}
	}
	return moulds, content
}

// mouldFor picks the mould that draws one item, or nothing when no mould claims its shape.
func mouldFor(moulds []any, repeat *binding, item any) any {
	if repeat.match == "" {
		if len(moulds) == 0 {
			return nil
		}
		return moulds[0]
	}

	wanted := ""
	if obj, ok := item.(map[string]any); ok {
		if value, found := readDotted(obj, repeat.match); found && value != nil {
			wanted = textOf(value)
		}
	}

	for _, mould := range moulds {
		if variantOf(mould) == wanted {
			return mould
		}
	}
	for _, mould := range moulds {
		if variantOf(mould) == variantFallback {
			return mould
		}
	}
	return nil
}

// stripVariant drops when: how a mould was chosen is not something a device has any use for.
func stripVariant(n any) any {
	obj, ok := n.(map[string]any)
	if !ok {
		return n
	}
	if _, present := obj["when"]; !present {
		return n
	}
	out := make(map[string]any, len(obj)-1)
	for key, value := range obj {
		if key != "when" {
			out[key] = value
		}
	}
	return out
}

// ---------------------------------------------------------------------------------- legacy
//
// Everything below reads metadata.bindings, the shape screens had before the binding contract
// existed: it mapped a component id to a collection key and left the rest implied. Delete this
// section if your screens were all authored against the contract -- legacyBinding then always
// returns nil, and nothing else needs it.

type kind int

const (
	kindList kind = iota
	kindObject
)

func (h *hydrator) legacyBinding(n map[string]any, frames []frame, want kind) *binding {
	id, ok := n["id"].(string)
	if !ok {
		return nil
	}
	key := strings.TrimSpace(h.legacy[id])
	if key == "" {
		return nil
	}
	resolved, _ := h.source(key, frames)
	switch want {
	case kindList:
		if _, ok := resolved.([]any); !ok {
			return nil
		}
	case kindObject:
		if _, ok := resolved.(map[string]any); !ok {
			return nil
		}
	}
	return &binding{source: key, alias: legacyAliases(key)[0]}
}

func legacyBindingsOf(screen map[string]any) map[string]string {
	metadata, ok := screen["metadata"].(map[string]any)
	if !ok {
		return nil
	}
	bindings, ok := metadata["bindings"].(map[string]any)
	if !ok {
		return nil
	}
	out := make(map[string]string, len(bindings))
	for id, value := range bindings {
		if key, ok := value.(string); ok {
			out[id] = key
		}
	}
	return out
}

// legacyAliases lists every name an unmigrated screen might use for one item of key.
//
// Generous on purpose. These screens were authored against a rule nobody wrote down, so the only
// safe reading of them is to accept every name that rule could have produced. New bindings declare
// their name and get exactly one.
func legacyAliases(key string) []string {
	if strings.TrimSpace(key) == "" {
		return []string{"item"}
	}
	clean := cleanCollectionKey(key)
	last := clean
	if cut := strings.LastIndex(clean, "_"); cut >= 0 {
		last = clean[cut+1:]
	}

	out := make([]string, 0, 6)
	for _, candidate := range []string{singularise(last), singularise(clean), clean, key, "item", "it"} {
		if strings.TrimSpace(candidate) != "" && !slices.Contains(out, candidate) {
			out = append(out, candidate)
		}
	}
	return out
}

func cleanCollectionKey(key string) string {
	for _, suffix := range []string{"_list", "_items", "_array"} {
		key = strings.TrimSuffix(key, suffix)
	}
	return key
}

var pluralSuffix = regexp.MustCompile(`(shes|ches|sses|xes)$`)

func singularise(word string) string {
	lower := strings.ToLower(word)
	switch {
	case strings.HasSuffix(lower, "ies") && len(lower) > 4:
		return lower[:len(lower)-3] + "y"
	case pluralSuffix.MatchString(lower):
		return lower[:len(lower)-2]
	case strings.HasSuffix(lower, "s") && !strings.HasSuffix(lower, "ss") && len(lower) > 2:
		return lower[:len(lower)-1]
	case lower == "":
		return "item"
	default:
		return lower
	}
}
