package io.heimui.hydration

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import kotlin.system.exitProcess

/**
 * Runs the published hydration corpus against this implementation.
 *
 * Every case is a screen, a payload, the document a device should receive, and the expressions that
 * should have been reported as unresolved. If all of them pass, this implementation agrees with
 * every other one -- which is the only definition of correct that means anything here.
 *
 *     kotlin RunCorpusKt [path/to/corpus]
 */
fun main(args: Array<String>) {
    val json = Json { ignoreUnknownKeys = true }
    val dir = File(args.firstOrNull() ?: "../../corpus")
    val cases = dir.listFiles { f -> f.extension == "json" }?.sortedBy { it.name }.orEmpty()
    if (cases.isEmpty()) {
        System.err.println("no cases found in ${dir.absolutePath}")
        exitProcess(1)
    }

    val failures = mutableListOf<String>()
    for (file in cases) {
        val case = json.parseToJsonElement(file.readText()).jsonObject
        val policy = when (case["options"]?.jsonObject?.get("onUnresolved")?.jsonPrimitive?.contentOrNull) {
            "blank" -> UnresolvedPolicy.BLANK
            else -> UnresolvedPolicy.KEEP
        }
        val result = HeimHydrationEngine.hydrateWithReport(case["screen"]!!.jsonObject, case["data"]!!.jsonObject, policy)

        val before = failures.size
        if (result.document != case["expected"]!!.jsonObject) {
            failures += "${file.name}: document\n  expected ${case["expected"]}\n  but was  ${result.document}"
        }
        val wanted = (case["expectedUnresolved"] as? JsonArray).orEmpty().map {
            val o = it.jsonObject
            "${o["nodeId"]!!.jsonPrimitive.content}|${o["property"]!!.jsonPrimitive.content}|${o["expression"]!!.jsonPrimitive.content}"
        }
        val got = result.unresolved.map { "${it.nodeId}|${it.property}|${it.expression}" }
        if (wanted != got) failures += "${file.name}: unresolved\n  expected $wanted\n  but was  $got"

        println(if (failures.size == before) "  ok   ${file.name}" else "  FAIL ${file.name}")
    }

    println()
    if (failures.isNotEmpty()) {
        System.err.println(failures.joinToString("\n"))
        exitProcess(1)
    }
    println("${cases.size}/${cases.size} cases pass.")
}

private fun JsonArray?.orEmpty(): List<kotlinx.serialization.json.JsonElement> = this ?: emptyList()
