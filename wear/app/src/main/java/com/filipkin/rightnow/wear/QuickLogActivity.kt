package com.filipkin.rightnow.wear

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import org.json.JSONObject
import java.util.Calendar

private data class ActivityDef(val index: Int, val name: String, val color: Int, val skipFeeling: Boolean)
private data class PendingHour(val date: String, val hour: Int)

private val FEELINGS = arrayOf("Terrible", "Poor", "Ok", "Neutral", "Good", "Great")

class QuickLogActivity : ComponentActivity() {
  private val notifPerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) {}

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    setContent {
      MaterialTheme {
        val activities = remember { loadActivities() }
        val pending = remember { buildPending() }
        var stepIndex by remember { mutableIntStateOf(0) }
        var selected by remember { mutableStateOf<ActivityDef?>(null) }

        // Finished every pending hour (or nothing to log) -> clear the prompt and exit.
        if (stepIndex >= pending.size) {
          LaunchedEffect(Unit) {
            PromptNotifier.cancel(this@QuickLogActivity)
            finish()
          }
          return@MaterialTheme
        }

        val cur = pending[stepIndex]
        val counter = if (pending.size > 1) " (" + (stepIndex + 1) + " of " + pending.size + ")" else ""

        fun submit(activityIndex: Int, feeling: Int?) {
          AnswerSender.send(this@QuickLogActivity, cur.date, cur.hour, activityIndex, feeling, System.currentTimeMillis())
          selected = null
          stepIndex += 1
        }

        val sel = selected
        if (sel == null) {
          ScalingLazyColumn(modifier = Modifier.fillMaxWidth()) {
            item {
              Text(
                text = hourRange(cur.hour) + counter,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
              )
            }
            items(activities.size) { i ->
              val a = activities[i]
              Chip(
                label = { Text(a.name) },
                colors = ChipDefaults.chipColors(backgroundColor = Color(a.color), contentColor = Color.White),
                onClick = { if (a.skipFeeling) submit(a.index, null) else selected = a },
                modifier = Modifier.fillMaxWidth(),
              )
            }
          }
        } else {
          ScalingLazyColumn(modifier = Modifier.fillMaxWidth()) {
            item {
              Text(
                text = sel.name + counter,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
              )
            }
            items(FEELINGS.size) { i ->
              Chip(
                label = { Text(FEELINGS[i]) },
                onClick = { submit(sel.index, i) },
                modifier = Modifier.fillMaxWidth(),
              )
            }
          }
        }
      }
    }
  }

  private fun hourRange(hour: Int): String {
    fun fmt(h: Int) = (if (h < 10) "0" else "") + h + ":00"
    return fmt(hour) + " - " + fmt((hour + 1) % 24)
  }

  private fun loadActivities(): List<ActivityDef> {
    val json = StateCache.readTaxonomy(this) ?: return emptyList()
    return try {
      val arr = JSONObject(json).optJSONArray("activities") ?: return emptyList()
      (0 until arr.length()).mapNotNull { i ->
        val o = arr.optJSONObject(i) ?: return@mapNotNull null
        val colorInt = try {
          android.graphics.Color.parseColor(o.optString("color", "#888888"))
        } catch (e: Exception) {
          android.graphics.Color.GRAY
        }
        ActivityDef(o.optInt("index", i), o.optString("name", "?"), colorInt, o.optBoolean("skipFeeling", false))
      }
    } catch (e: Exception) {
      emptyList()
    }
  }

  // Pending hours oldest->newest, same formula as the phone overlay's buildPending():
  // clamp(streak0 + hours elapsed since t0, 1, cap), then now-i hours, start of hour.
  private fun buildPending(): List<PendingHour> {
    val p = StateCache.readPrompt(this) ?: StateCache.readReminder(this)
    val streak0 = p?.optInt("streak0", 0) ?: 0
    val t0 = p?.optLong("t0", System.currentTimeMillis()) ?: System.currentTimeMillis()
    val cap = p?.optInt("cap", 24) ?: 24
    val elapsed = Math.max(0L, (System.currentTimeMillis() - t0) / 3600000L).toInt()
    val n = Math.max(1, Math.min(streak0 + elapsed, cap))
    val list = ArrayList<PendingHour>()
    for (i in n downTo 1) {
      val c = Calendar.getInstance()
      c.add(Calendar.HOUR_OF_DAY, -i)
      c.set(Calendar.MINUTE, 0); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0)
      val date = "" + c.get(Calendar.YEAR) + "-" + (c.get(Calendar.MONTH) + 1) + "-" + c.get(Calendar.DAY_OF_MONTH)
      list.add(PendingHour(date, c.get(Calendar.HOUR_OF_DAY)))
    }
    return list
  }
}
