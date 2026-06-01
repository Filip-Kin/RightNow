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

  fun writePrompt(ctx: Context, streak0: Int, t0: Long, cap: Int) {
    try {
      val o = JSONObject()
      o.put("streak0", streak0); o.put("t0", t0); o.put("cap", cap)
      f(ctx, "prompt.json").writeText(o.toString())
    } catch (e: Exception) {}
  }

  fun readTaxonomy(ctx: Context): String? = try {
    val x = f(ctx, "taxonomy.json"); if (x.exists()) x.readText() else null
  } catch (e: Exception) { null }

  fun readReminder(ctx: Context): JSONObject? = readJson(ctx, "reminder.json")
  fun readPrompt(ctx: Context): JSONObject? = readJson(ctx, "prompt.json")

  private fun readJson(ctx: Context, name: String): JSONObject? = try {
    val x = f(ctx, name); if (x.exists()) JSONObject(x.readText()) else null
  } catch (e: Exception) { null }
}
