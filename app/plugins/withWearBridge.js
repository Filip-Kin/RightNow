// Wear OS (Pixel Watch 3) bridge for the hourly quick-log. Companion-only: the
// phone drives timing; the watch only answers the prompt. Built on the SAME
// plaintext-bridge + headless-drain pipeline as the phone overlay (see
// plugins/withQuickLogOverlay). All injected at prebuild time (android/ is
// regenerated each build). Kotlin uses string concatenation (no $-templates).
//
// Transport is the Wearable Data Layer (DataClient): DataItems persist and
// replicate on reconnect, so an answer made while the phone is out of range / asleep
// still reaches the phone (and the server) once they reconnect, with no app launch.
//
// This plugin owns:
//   - the play-services-wearable gradle dependency,
//   - WearBridge.kt: a shared helper to PUT phone->watch state DataItems
//     (taxonomy/reminder/prompt). Also called from withQuickLogOverlay's
//     QuickLogModule + scheduler, so this plugin MUST be registered alongside
//     withQuickLogOverlay (which now references WearBridge).
//   - RightNowWearListenerService.kt: receives watch->phone answer DataItems,
//     appends each to quicklog-queue.json, deletes the consumed item, and kicks the
//     existing RightNowQuickLogDrain headless task (reusing HeadlessKick).
const { withAndroidManifest, withAppBuildGradle, withDangerousMod, AndroidConfig } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PKG = "com.filipkin.rightnow";
const WEARABLE_DEP = 'implementation("com.google.android.gms:play-services-wearable:18.2.0")';

// Phone -> watch state pushes (fixed paths = overwrite-latest) and the hourly
// prompt trigger. Used by QuickLogModule (pushTaxonomy/pushReminder) and the
// scheduler (putPrompt) over in withQuickLogOverlay.
const WEAR_BRIDGE_KT = `package ${PKG}

import android.content.Context
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable

object WearBridge {
  // Mirror a plaintext JSON state file to the watch at a fixed path. The watch caches
  // it so its UI renders even when the phone is unreachable.
  fun putState(ctx: Context, path: String, json: String) {
    val req = PutDataMapRequest.create(path)
    req.dataMap.putString("json", json)
    req.dataMap.putLong("updatedAt", System.currentTimeMillis())
    val r = req.asPutDataRequest()
    r.setUrgent()
    Wearable.getDataClient(ctx).putDataItem(r)
  }

  // The hourly trigger: the watch posts its own local notification on this change.
  // Carries the current streak baseline so the watch computes the same pending-hour
  // count the phone overlay does (streak0 + hours elapsed since t0, capped).
  fun putPrompt(ctx: Context, streak0: Int, t0: Long, cap: Int) {
    val req = PutDataMapRequest.create("/rightnow/prompt")
    req.dataMap.putInt("streak0", streak0)
    req.dataMap.putLong("t0", t0)
    req.dataMap.putInt("cap", cap)
    req.dataMap.putLong("ts", System.currentTimeMillis())
    val r = req.asPutDataRequest()
    r.setUrgent()
    Wearable.getDataClient(ctx).putDataItem(r)
  }

  // Tell the watch the current prompt was answered on the phone, so it cancels its
  // own hourly notification.
  fun notifyCleared(ctx: Context) {
    val req = PutDataMapRequest.create("/rightnow/cleared")
    req.dataMap.putLong("ts", System.currentTimeMillis())
    val r = req.asPutDataRequest()
    r.setUrgent()
    Wearable.getDataClient(ctx).putDataItem(r)
  }
}
`;

// Receives answer DataItems from the watch. The system starts this service on data
// delivery even if the app process is dead, so the drain runs headlessly.
const LISTENER_KT = `package ${PKG}

import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

class RightNowWearListenerService : WearableListenerService() {
  override fun onDataChanged(events: DataEventBuffer) {
    var kicked = false
    for (event in events) {
      if (event.type != DataEvent.TYPE_CHANGED) continue
      val uri = event.dataItem.uri
      val path = uri.path ?: continue
      if (!path.startsWith("/rightnow/answer")) continue
      try {
        val map = DataMapItem.fromDataItem(event.dataItem).dataMap
        val date = map.getString("date") ?: continue
        val hour = map.getInt("hour", -1)
        if (hour < 0) continue
        val activity = map.getInt("activity", -1)
        val feeling = map.getInt("feeling", -1)
        val ts = map.getLong("ts", System.currentTimeMillis())
        appendAnswer(date, hour, if (activity < 0) null else activity, if (feeling < 0) null else feeling, ts)
        // Delete the consumed item so it doesn't re-deliver (and re-enqueue) on every
        // future reconnect/sync.
        try { Wearable.getDataClient(this).deleteDataItems(uri) } catch (e: Exception) {}
        kicked = true
      } catch (e: Exception) {}
    }
    // The watch answered, so the phone's own hourly notification is moot - clear it,
    // then encrypt + push via the existing JS headless drain (loads the DEK from
    // SecureStore with no user auth). No-op-safe if locked/offline (queue persists).
    if (kicked) {
      try { NotificationManagerCompat.from(this).cancel(QuickLogScheduler.NOTIF_ID) } catch (e: Exception) {}
      HeadlessKick.kick(applicationContext)
    }
  }

  // Same append contract as QuickLogService.appendAnswer (the JS drain reads this).
  @Synchronized private fun appendAnswer(date: String, hour: Int, activity: Int?, feeling: Int?, ts: Long) {
    try {
      val f = File(filesDir, "quicklog-queue.json")
      val arr = try { if (f.exists()) JSONArray(f.readText()) else JSONArray() } catch (e: Exception) { JSONArray() }
      val o = JSONObject()
      o.put("date", date); o.put("hour", hour)
      if (activity == null) o.put("activity", JSONObject.NULL) else o.put("activity", activity)
      if (feeling == null) o.put("feeling", JSONObject.NULL) else o.put("feeling", feeling)
      o.put("ts", ts)
      arr.put(o)
      f.writeText(arr.toString())
    } catch (e: Exception) {}
  }
}
`;

const FILES = {
  "WearBridge.kt": WEAR_BRIDGE_KT,
  "RightNowWearListenerService.kt": LISTENER_KT,
};

function withWearableDependency(config) {
  return withAppBuildGradle(config, (config) => {
    let src = config.modResults.contents;
    if (!src.includes("play-services-wearable")) {
      // Insert into the app-level dependencies block (first match in app/build.gradle).
      src = src.replace(/dependencies\s*\{/, (m) => `${m}\n    ${WEARABLE_DEP}`);
    }
    config.modResults.contents = src;
    return config;
  });
}

function withListenerManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    app.service = app.service || [];
    if (!app.service.some((s) => s.$["android:name"] === ".RightNowWearListenerService")) {
      app.service.push({
        $: { "android:name": ".RightNowWearListenerService", "android:exported": "true" },
        "intent-filter": [
          {
            action: [{ $: { "android:name": "com.google.android.gms.wearable.DATA_CHANGED" } }],
            data: [{ $: { "android:scheme": "wear", "android:host": "*", "android:pathPrefix": "/rightnow/answer" } }],
          },
        ],
      });
    }
    return config;
  });
}

function withKotlinFiles(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "java", PKG.replace(/\./g, "/"));
      fs.mkdirSync(dir, { recursive: true });
      for (const [name, contents] of Object.entries(FILES)) {
        fs.writeFileSync(path.join(dir, name), contents);
      }
      return config;
    },
  ]);
}

module.exports = function withWearBridge(config) {
  config = withWearableDependency(config);
  config = withListenerManifest(config);
  config = withKotlinFiles(config);
  return config;
};
