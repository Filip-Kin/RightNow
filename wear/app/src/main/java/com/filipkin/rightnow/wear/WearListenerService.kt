package com.filipkin.rightnow.wear

import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService

// Receives phone->watch state. Caches taxonomy/reminder for the UI and, on the hourly
// /rightnow/prompt, posts the watch-local prompt notification. Ignores /rightnow/answer
// (those are this watch's own outgoing items).
class WearListenerService : WearableListenerService() {
  override fun onDataChanged(events: DataEventBuffer) {
    for (event in events) {
      if (event.type != DataEvent.TYPE_CHANGED) continue
      val path = event.dataItem.uri.path ?: continue
      try {
        val map = DataMapItem.fromDataItem(event.dataItem).dataMap
        when (path) {
          "/rightnow/taxonomy" -> StateCache.writeTaxonomy(this, map.getString("json") ?: "")
          "/rightnow/reminder" -> StateCache.writeReminder(this, map.getString("json") ?: "")
          "/rightnow/prompt" -> {
            StateCache.writePrompt(
              this,
              map.getInt("streak0", 0),
              map.getLong("t0", System.currentTimeMillis()),
              map.getInt("cap", 24),
            )
            PromptNotifier.show(this)
          }
          // The prompt was answered on the phone -> clear our notification too.
          "/rightnow/cleared" -> PromptNotifier.cancel(this)
        }
      } catch (e: Exception) {}
    }
  }
}
