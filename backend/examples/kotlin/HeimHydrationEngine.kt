package io.heimui.hydration

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * An expression that resolved to nothing.
 *
 * Reported rather than swallowed. The literal `{{ product.name }}` reaching a user is the failure
 * the whole binding contract exists to prevent, and the previous version of this engine left the
 * braces in place without telling anyone -- so the first report came from a screenshot.
 */
data class UnresolvedExpression(
    val nodeId: String,
    val property: String,
    val expression: String,
)

data class HydrationResult(
    val document: JsonObject,
    val unresolved: List<UnresolvedExpression>,
)

/** What is left behind where an expression resolved to nothing. Both policies report. */
enum class UnresolvedPolicy { KEEP, BLANK }

/**
 * Merges a screen with a payload.
 *
 * The semantics are not defined here: they are defined by the corpus in
 * `src/test/resources/hydration`, a copy of `heimui-core/schema/hydration`, which the Studio's own
 * engine runs as well. There are two implementations of this and they used to disagree about
 * which containers repeat, whether a name resolves inside an enclosing list, and what one item is
 * called -- which is how a screen could look finished in the editor and ship its placeholders as
 * literal text to a device.
 *
 * Two rules worth stating before the code:
 *
 * - `{{state.*}}` is not ours. The SDK resolves it on the device against form state; consuming it
 *   here turns a user's typing into an empty string in a submitted payload.
 * - `metadata` survives. It carries the release identity a host app reports to analytics, and
 *   dropping it -- which this engine used to do -- leaves the system unable to say which version
 *   of a screen a user saw.
 */
object HeimHydrationEngine {

    private const val RESERVED_NAMESPACE = "state"
    private val EXPRESSION = Regex("""\{\{\s*([^{}]+?)\s*}}""")
    private val CHILD_BUCKETS = listOf("items", "children")

    /**
     * A name introduced by a `repeat` or a `scope`, in force for one subtree.
     *
     * [self] is the item itself, which matters when a collection holds primitives: a list of tags
     * is bound with `{{ tag }}`, and there is no field to read.
     */
    private data class Frame(val aliases: List<String>, val value: JsonObject, val self: JsonElement?)

    private class Context(
        val policy: UnresolvedPolicy,
        val legacyBindings: Map<String, String>,
        val unresolved: MutableList<UnresolvedExpression> = mutableListOf(),
    )

    fun hydrateWithReport(
        screen: JsonObject,
        data: JsonObject,
        policy: UnresolvedPolicy = UnresolvedPolicy.KEEP,
    ): HydrationResult {
        val ctx = Context(policy, legacyBindingsOf(screen))
        val root = screen["root"] ?: return HydrationResult(screen, emptyList())
        val hydratedRoot = hydrateNode(root, emptyList(), data, ctx)

        val out = buildMap {
            // Everything the author wrote travels unchanged, except the declared contract: that is
            // authoring-time information and a device has no use for it.
            screen.forEach { (key, value) -> if (key != "data" && key != "root") put(key, value) }
            put("root", hydratedRoot)
        }
        return HydrationResult(JsonObject(out), ctx.unresolved.toList())
    }

    fun hydrate(screen: JsonObject, data: JsonObject): JsonObject =
        hydrateWithReport(screen, data).document

    // ------------------------------------------------------------------ walk

    private fun hydrateNode(
        node: JsonElement,
        frames: List<Frame>,
        data: JsonObject,
        ctx: Context,
        stateScope: String = "",
    ): JsonElement = when (node) {
        is JsonPrimitive -> if (node.isString) interpolate(node.content, frames, data, ctx, "", "") else node
        is JsonArray -> JsonArray(node.map { hydrateNode(it, frames, data, ctx, stateScope) })
        JsonNull -> JsonNull
        is JsonObject -> hydrateObject(node, frames, data, ctx, stateScope)
    }

    private fun hydrateObject(
        node: JsonObject,
        frames: List<Frame>,
        data: JsonObject,
        ctx: Context,
        stateScope: String = "",
    ): JsonObject {
        val nodeId = node["id"]?.jsonPrimitive?.contentOrNull.orEmpty()

        val declaredScope = readBinding(node["scope"])
        val scope = declaredScope ?: legacyScope(node, frames, data, ctx)
        var localFrames = frames
        if (scope != null) {
            val value = resolveSource(scope.source, frames, data)
            if (value is JsonObject) {
                val aliases = if (declaredScope != null) listOf(scope.alias) else legacyAliases(scope.source)
                localFrames = frames + Frame(aliases, value, value)
            }
        }

        val declaredRepeat = readBinding(node["repeat"])
        val repeat = declaredRepeat ?: legacyRepeat(node, frames, data, ctx)
        val bucket = repeat?.let { bucketOf(node) }

        val result = LinkedHashMap<String, JsonElement>()
        var expandedBucket: String? = null

        if (repeat != null && bucket != null) {
            val authored = node[bucket]?.let { it as? JsonArray } ?: JsonArray(emptyList())
            // Everything that is not a mould is content, not template. Replacing the whole bucket
            // with the expansion deleted it -- a footer, a "see all" link -- with no error anywhere.
            val (moulds, content) = splitMoulds(authored.toList(), repeat)
            val trailing = content.map { hydrateNode(it, localFrames, data, ctx, stateScope) }
            val collection = resolveSource(repeat.source, frames, data) as? JsonArray
            val aliases = if (declaredRepeat != null) listOf(repeat.alias) else legacyAliases(repeat.source)

            val expansion: List<JsonElement> = when {
                moulds.isEmpty() -> emptyList()
                collection == null || collection.isEmpty() ->
                    repeat.empty?.let { listOf(hydrateNode(it, localFrames, data, ctx, stateScope)) } ?: emptyList()
                else -> collection.flatMapIndexed { index, item ->
                    // A list of one shape has one mould; a feed of products, banners and separators
                    // picks the one whose `variant` matches. An entry no mould claims is left out
                    // rather than drawn with the wrong template.
                    val mould = mouldFor(moulds, repeat, item) ?: return@flatMapIndexed emptyList()
                    // Only a row that writes form state needs a namespace; a catalogue of product
                    // cards would be paying bytes for nothing.
                    val scoped = holdsFormState(mould)
                    val itemScope = scopeForItem(stateScope, repeat.source, item, index)
                    val copy = stripVariant(
                        hydrateNode(
                            mould,
                            localFrames + Frame(aliases, asFrameValue(item), item),
                            data,
                            ctx,
                            if (scoped) itemScope else stateScope,
                        )
                    )
                    listOf(
                        if (scoped && copy is JsonObject) {
                            JsonObject(copy + ("state_scope" to JsonPrimitive(itemScope)))
                        } else {
                            copy
                        }
                    )
                }
            }

            result[bucket] = JsonArray(expansion + trailing)
            expandedBucket = bucket
        }

        for ((key, value) in node) {
            // Authoring-time keys never reach a device.
            if (key == "repeat" || key == "scope") continue
            // Already expanded above; walking it again would report the same unresolved expression
            // twice and substitute into text hydration itself produced.
            if (key == expandedBucket) continue
            result[key] = when (value) {
                is JsonPrimitive ->
                    if (value.isString) interpolate(value.content, localFrames, data, ctx, nodeId, key) else value
                else -> hydrateNode(value, localFrames, data, ctx, stateScope)
            }
        }

        // Key order follows the authored document, with the expanded bucket back in its place.
        if (expandedBucket != null) {
            val ordered = LinkedHashMap<String, JsonElement>()
            for (key in node.keys) {
                if (key == "repeat" || key == "scope") continue
                result[key]?.let { ordered[key] = it }
            }
            return JsonObject(ordered)
        }
        return JsonObject(result)
    }

    private fun bucketOf(node: JsonObject): String? =
        CHILD_BUCKETS.firstOrNull { node[it] is JsonArray }

    /**
     * Whether anything under here writes to form state.
     *
     * The namespace exists to tell three `full_name` inputs apart, not to decorate every list.
     */
    private fun holdsFormState(node: JsonElement): Boolean = when (node) {
        is JsonObject -> {
            val own = (node["state_key"] as? JsonPrimitive)?.contentOrNull?.isNotBlank() == true
            own || node.values.any { holdsFormState(it) }
        }
        is JsonArray -> node.any { holdsFormState(it) }
        else -> false
    }

    /**
     * What one row is called, for the state it owns.
     *
     * The item's own `id` when it has one, because a list that reorders must not hand row three's
     * half-typed answer to row one. An index is the fallback, and it is only as stable as the order.
     */
    private fun scopeForItem(parentScope: String, source: String, item: JsonElement, index: Int): String {
        val identity = (item as? JsonObject)
            ?.get("id")
            ?.let { it as? JsonPrimitive }
            ?.contentOrNull
            ?: index.toString()
        val own = "$source/$identity"
        return if (parentScope.isEmpty()) own else "$parentScope/$own"
    }

    private fun asFrameValue(item: JsonElement): JsonObject =
        item as? JsonObject ?: JsonObject(mapOf("value" to item))

    // ------------------------------------------------------------------ expressions

    private fun interpolate(
        raw: String,
        frames: List<Frame>,
        data: JsonObject,
        ctx: Context,
        nodeId: String,
        property: String,
    ): JsonPrimitive {
        if (!raw.contains("{{")) return JsonPrimitive(raw)

        val replaced = EXPRESSION.replace(raw) { match ->
            val path = match.groupValues[1].trim()
            // The device owns this one.
            if (path == RESERVED_NAMESPACE || path.startsWith("$RESERVED_NAMESPACE.")) {
                match.value
            } else {
                when (val value = resolveExpression(path, frames, data)) {
                    // Absent is a mistake worth reporting. Present and null is the backend saying
                    // "there is no badge on this product", which is an answer, and rendering the
                    // literal word `null` on a device was the old way of getting that wrong.
                    null -> {
                        ctx.unresolved += UnresolvedExpression(nodeId, property, path)
                        if (ctx.policy == UnresolvedPolicy.BLANK) "" else match.value
                    }
                    is JsonNull -> ""
                    is JsonPrimitive -> value.content
                    else -> value.toString()
                }
            }
        }
        return JsonPrimitive(replaced)
    }

    /**
     * A name resolves in the innermost frame that introduces it, then against the payload root.
     *
     * Innermost-first is what makes a list inside a list work: both moulds can call their item
     * `item` without the outer one winning.
     */
    private fun resolveExpression(path: String, frames: List<Frame>, data: JsonObject): JsonElement? {
        val dot = path.indexOf('.')
        val head = if (dot == -1) path else path.substring(0, dot)
        val tail = if (dot == -1) "" else path.substring(dot + 1)

        for (frame in frames.asReversed()) {
            if (!frame.aliases.contains(head)) continue
            return if (tail.isEmpty()) frame.self else readDotted(frame.value, tail)
        }

        // A bare name inside a frame means a field of that frame: `{{ name }}` in a product mould.
        if (tail.isEmpty()) {
            for (frame in frames.asReversed()) {
                readDotted(frame.value, head)?.let { return it }
            }
        }

        return readDotted(data, path)
    }

    /** Where a `source` points: a field of an enclosing frame first, the payload root otherwise. */
    private fun resolveSource(source: String, frames: List<Frame>, data: JsonObject): JsonElement? {
        for (frame in frames.asReversed()) {
            readDotted(frame.value, source)?.let { return it }
        }
        return readDotted(data, source)
    }

    /** Fields may be dotted (`brand.name`), which is how a nested object is addressed. */
    private fun readDotted(source: JsonObject, field: String): JsonElement? {
        var current: JsonElement = source
        for (segment in field.split('.')) {
            val obj = current as? JsonObject ?: return null
            current = obj[segment] ?: return null
        }
        return current
    }

    // ------------------------------------------------------------------ bindings

    private data class Binding(
        val source: String,
        val alias: String,
        val empty: JsonElement?,
        /**
         * The item field that decides which mould draws it.
         *
         * A field name rather than an expression, so an editor can check it against a declared
         * contract and say which entries no mould claims. A condition that is a program can only
         * be run, never reasoned about.
         */
        val match: String? = null,
    )

    private fun readBinding(value: JsonElement?): Binding? {
        val obj = value as? JsonObject ?: return null
        val source = obj["source"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
        val alias = obj["as"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
        if (source.isEmpty() || alias.isEmpty()) return null
        val match = obj["match"]?.jsonPrimitive?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }
        return Binding(source, alias, obj["empty"], match)
    }

    private const val VARIANT_FALLBACK = "*"

    private fun variantOf(node: JsonElement): String? =
        ((node as? JsonObject)?.get("when") as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }

    /**
     * Splits a repeating container's children into the moulds and the content after them.
     *
     * Without `match` the first child is the only mould, which is what every list written before
     * this does. With it, the moulds are the children that say which value they draw.
     */
    private fun splitMoulds(children: List<JsonElement>, repeat: Binding): Pair<List<JsonElement>, List<JsonElement>> =
        if (repeat.match == null) {
            children.take(1) to children.drop(1)
        } else {
            children.partition { variantOf(it) != null }
        }

    /** The mould that draws one item, or nothing when the list has a shape no mould claims. */
    private fun mouldFor(moulds: List<JsonElement>, repeat: Binding, item: JsonElement): JsonElement? {
        val match = repeat.match ?: return moulds.firstOrNull()
        val value = (item as? JsonObject)?.let { readDotted(it, match) }
        val asString = when (value) {
            null, is JsonNull -> ""
            is JsonPrimitive -> value.content
            else -> value.toString()
        }
        return moulds.firstOrNull { variantOf(it) == asString }
            ?: moulds.firstOrNull { variantOf(it) == VARIANT_FALLBACK }
    }

    /** How a mould was chosen is not something a device has any use for. */
    private fun stripVariant(node: JsonElement): JsonElement =
        if (node is JsonObject && node.containsKey("when")) JsonObject(node - "when") else node

    private fun legacyBindingsOf(screen: JsonObject): Map<String, String> {
        val bindings = (screen["metadata"] as? JsonObject)?.get("bindings") as? JsonObject ?: return emptyMap()
        return bindings.mapNotNull { (id, value) ->
            (value as? JsonPrimitive)?.contentOrNull?.let { id to it }
        }.toMap()
    }

    /**
     * A binding from before the contract existed.
     *
     * `metadata.bindings` mapped a component id to a collection key and left everything else
     * implied: whether it repeated or scoped was decided from the shape of the data, and what one
     * item was called was derived from the key by rules the two engines did not share. Reading it
     * here means a screen that has not been migrated renders exactly as it did before.
     */
    private fun legacyKey(node: JsonObject, ctx: Context): String? {
        val id = node["id"]?.jsonPrimitive?.contentOrNull ?: return null
        return ctx.legacyBindings[id]?.takeIf { it.isNotBlank() }?.trim()
    }

    private fun legacyRepeat(node: JsonObject, frames: List<Frame>, data: JsonObject, ctx: Context): Binding? {
        val key = legacyKey(node, ctx) ?: return null
        return if (resolveSource(key, frames, data) is JsonArray) Binding(key, legacyAliases(key).first(), null) else null
    }

    private fun legacyScope(node: JsonObject, frames: List<Frame>, data: JsonObject, ctx: Context): Binding? {
        val key = legacyKey(node, ctx) ?: return null
        return if (resolveSource(key, frames, data) is JsonObject) Binding(key, legacyAliases(key).first(), null) else null
    }

    /**
     * Every name an unmigrated screen might be using for one item of `key`.
     *
     * Generous on purpose, and identical to the Studio's list. These screens were authored against
     * a rule nobody wrote down, so the only safe reading of them is to accept every name that rule
     * could have produced -- `chips_list` was addressed as `chip`, and dropping that would break
     * working screens to make a point. New bindings declare their name and get exactly one.
     */
    internal fun legacyAliases(key: String): List<String> {
        if (key.isBlank()) return listOf("item")
        val clean = cleanCollectionKey(key)
        return listOf(
            singularise(clean.substringAfterLast('_')),
            singularise(clean),
            clean,
            key,
            "item",
            "it",
        ).filter { it.isNotBlank() }.distinct()
    }

    private fun cleanCollectionKey(key: String): String =
        key.removeSuffix("_list").removeSuffix("_items").removeSuffix("_array")

    private fun singularise(word: String): String {
        val lower = word.lowercase()
        return when {
            lower.endsWith("ies") && lower.length > 4 -> lower.dropLast(3) + "y"
            Regex("(shes|ches|sses|xes)$").containsMatchIn(lower) -> lower.dropLast(2)
            lower.endsWith("s") && !lower.endsWith("ss") && lower.length > 2 -> lower.dropLast(1)
            else -> lower.ifEmpty { "item" }
        }
    }
}
