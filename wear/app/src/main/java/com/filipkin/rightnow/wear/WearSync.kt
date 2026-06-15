package com.filipkin.rightnow.wear

import android.content.Context
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable

// On a fresh install (e.g. reinstalled from the Play Store) the watch's StateCache is
// empty, and WearListenerService only fires for FUTURE pushes - so the UI would stay
// blank until the phone's next hourly push. The phone and watch share an applicationId,
// so the phone's last /rightnow/* DataItems persist in and replicate over the Data
// Layer. Read them on launch to rebuild the cache immediately. This is a passive read,
// so (unlike a prompt re-push) it does NOT raise a watch notification.
object WearSync {
  fun hydrate(ctx: Context, onDone: () -> Unit) {
    try {
      Wearable.getDataClient(ctx).getDataItems().addOnCompleteListener { task ->
        try {
          if (task.isSuccessful && task.result != null) {
            val buffer = task.result
            try {
              for (item in buffer) {
                val path = item.uri.path ?: continue
                val map = DataMapItem.fromDataItem(item).dataMap
                when (path) {
                  "/rightnow/taxonomy" -> map.getString("json")?.let { StateCache.writeTaxonomy(ctx, it) }
                  "/rightnow/reminder" -> map.getString("json")?.let { StateCache.writeReminder(ctx, it) }
                  "/rightnow/prompt" -> StateCache.writePrompt(ctx, map.getString("filled") ?: "{}", map.getInt("cap", 24))
                }
              }
            } finally {
              buffer.release()
            }
          }
        } catch (e: Exception) {}
        onDone()
      }
    } catch (e: Exception) {
      onDone()
    }
  }
}
