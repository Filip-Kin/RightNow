package com.filipkin.rightnow.wear

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
    // Let the full-screen-intent prompt wake the watch and show over the lock screen.
    setShowWhenLocked(true)
    setTurnScreenOn(true)
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
          // Locally mark it filled so a re-open before the phone re-pushes the ledger
          // doesn't re-ask this hour.
          StateCache.markFilled(this@QuickLogActivity, cur.date, cur.hour, slotMs(cur.date, cur.hour))
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
            // Two-column grid for the regular activities; skip-feeling ones (e.g. Sleep)
            // go full-width at the bottom since they submit in one tap.
            val gridActs = activities.filter { !it.skipFeeling }
            val instantActs = activities.filter { it.skipFeeling }
            val rows = gridActs.chunked(2)
            items(rows.size) { r ->
              val row = rows[r]
              Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
              ) {
                for (a in row) {
                  Chip(
                    label = { Text(a.name, maxLines = 1) },
                    colors = ChipDefaults.chipColors(backgroundColor = Color(a.color), contentColor = Color.White),
                    onClick = { selected = a },
                    modifier = Modifier.weight(1f),
                  )
                }
                if (row.size == 1) Spacer(modifier = Modifier.weight(1f))
              }
            }
            items(instantActs.size) { i ->
              val a = instantActs[i]
              Chip(
                label = { Text(a.name, maxLines = 1) },
                colors = ChipDefaults.chipColors(backgroundColor = Color(a.color), contentColor = Color.White),
                onClick = { submit(a.index, null) },
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
            // Picker display order: most-likely moods on top. Stored value is still the
            // FEELINGS index (0..5); only the layout order changes. Rows: Ok/Neutral,
            // Poor/Good, Terrible/Great.
            val frows = listOf(2, 3, 1, 4, 0, 5).chunked(2)
            items(frows.size) { r ->
              val row = frows[r]
              Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
              ) {
                for (fi in row) {
                  Chip(
                    label = { Text(FEELINGS[fi], maxLines = 1) },
                    onClick = { submit(sel.index, fi) },
                    modifier = Modifier.weight(1f),
                  )
                }
                if (row.size == 1) Spacer(modifier = Modifier.weight(1f))
              }
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

  // Start-of-hour epoch ms for a "Y-M-D" date + hour (used for the local filled-ledger).
  private fun slotMs(date: String, hour: Int): Long {
    return try {
      val p = date.split("-")
      val c = Calendar.getInstance()
      c.set(p[0].toInt(), p[1].toInt() - 1, p[2].toInt(), hour, 0, 0)
      c.set(Calendar.MILLISECOND, 0)
      c.timeInMillis
    } catch (e: Exception) { System.currentTimeMillis() }
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

  // Pending hours oldest->newest, from the shared filled-ledger the phone pushed:
  // the fully-elapsed hours in the last `cap` that aren't filled. Same computation as
  // the phone overlay's pendingSlots + the app's getToAsk. Min 1 so a tap logs the
  // current hour even when the ledger says everything's caught up.
  private fun buildPending(): List<PendingHour> {
    val cap = StateCache.readCap(this)
    val filled = StateCache.filledKeys(this)
    val list = ArrayList<PendingHour>()
    for (i in cap downTo 1) {
      val c = Calendar.getInstance()
      c.add(Calendar.HOUR_OF_DAY, -i)
      c.set(Calendar.MINUTE, 0); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0)
      val date = "" + c.get(Calendar.YEAR) + "-" + (c.get(Calendar.MONTH) + 1) + "-" + c.get(Calendar.DAY_OF_MONTH)
      val hour = c.get(Calendar.HOUR_OF_DAY)
      if (!filled.contains(date + "|" + hour)) list.add(PendingHour(date, hour))
    }
    if (list.isEmpty()) {
      val c = Calendar.getInstance()
      c.add(Calendar.HOUR_OF_DAY, -1)
      c.set(Calendar.MINUTE, 0); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0)
      val date = "" + c.get(Calendar.YEAR) + "-" + (c.get(Calendar.MONTH) + 1) + "-" + c.get(Calendar.DAY_OF_MONTH)
      list.add(PendingHour(date, c.get(Calendar.HOUR_OF_DAY)))
    }
    return list
  }
}
