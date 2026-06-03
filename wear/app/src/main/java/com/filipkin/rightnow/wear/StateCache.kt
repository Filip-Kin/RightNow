package com.filipkin.rightnow.wear

import android.content.Context
import org.json.JSONObject
import java.io.File

// Watch-local cache of the phone->watch state (taxonomy/reminder/prompt). Written by
// WearListenerService as DataItems arrive; read by QuickLogActivity so the UI renders
// even when the phone is momentarily unreachable. Plaintext only (no secrets here).
object StateCache {
  private fun f(ctx: Context, name: String) = File(ctx.filesDir, name)

  fun writeTaxonomy(ctx: Context, json: String) { try { f(ctx, "taxonomy.json").writeText(json) } catch (e: Exception) {} }
  fun writeReminder(ctx: Context, json: String) { try { f(ctx, "reminder.json").writeText(json) } catch (e: Exception) {} }

  // The hourly prompt now carries the shared filled-ledger (JSON of "date|hour" keys)
  // + the catch-up cap, so the watch asks for exactly the hours still open.
  fun writePrompt(ctx: Context, filledJson: String, cap: Int) {
    try {
      f(ctx, "filled.json").writeText(filledJson)
      f(ctx, "prompt.json").writeText(JSONObject().put("cap", cap).toString())
    } catch (e: Exception) {}
  }

  fun readCap(ctx: Context): Int = readJson(ctx, "prompt.json")?.optInt("cap", 24) ?: 24

  fun filledKeys(ctx: Context): Set<String> = try {
    val x = f(ctx, "filled.json")
    if (!x.exists()) emptySet() else {
      val o = JSONObject(x.readText())
      val out = HashSet<String>()
      val it = o.keys()
      while (it.hasNext()) out.add(it.next())
      out
    }
  } catch (e: Exception) { emptySet() }

  // Optimistically mark an hour filled locally when answered on the watch, so a re-open
  // before the phone re-pushes the ledger doesn't re-ask it.
  fun markFilled(ctx: Context, date: String, hour: Int, slotMs: Long) {
    try {
      val x = f(ctx, "filled.json")
      val o = try { if (x.exists()) JSONObject(x.readText()) else JSONObject() } catch (e: Exception) { JSONObject() }
      o.put(date + "|" + hour, slotMs)
      x.writeText(o.toString())
    } catch (e: Exception) {}
  }

  fun readTaxonomy(ctx: Context): String? = try {
    val x = f(ctx, "taxonomy.json"); if (x.exists()) x.readText() else null
  } catch (e: Exception) { null }

  fun readReminder(ctx: Context): JSONObject? = readJson(ctx, "reminder.json")

  private fun readJson(ctx: Context, name: String): JSONObject? = try {
    val x = f(ctx, name); if (x.exists()) JSONObject(x.readText()) else null
  } catch (e: Exception) { null }
}
