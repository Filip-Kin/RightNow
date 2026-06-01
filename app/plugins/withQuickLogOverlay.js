// Native hourly quick-log: an AlarmManager-driven notification whose tap starts a
// draw-over overlay Service DIRECTLY (no activity), so the user's foreground app
// never loses focus. All injected at prebuild time (android/ is regenerated each
// build). Kotlin is written with string concatenation (no $-templates) to avoid
// JS-template escaping bugs.
//
// Components:
//   QuickLogScheduler   - arm/disarm AlarmManager; post the notification (reads the
//                         plaintext quicklog-reminder.json JS writes for enabled/streak).
//   QuickLogAlarmReceiver - on alarm: post notification, re-arm next hour.
//   QuickLogBootReceiver  - re-arm after reboot if enabled.
//   QuickLogService     - the TYPE_APPLICATION_OVERLAY window (grid from
//                         quicklog-taxonomy.json); a tap appends to quicklog-queue.json,
//                         cancels the notification, and kicks the headless drain.
//   QuickLogDrainService - HeadlessJsTaskService running JS 'RightNowQuickLogDrain'.
//   QuickLogModule/Package - lets JS arm/disarm + manage the overlay permission.
const { withAndroidManifest, withMainApplication, withDangerousMod, AndroidConfig } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PKG = "com.filipkin.rightnow";

const SCHEDULER_KT = `package ${PKG}

import android.app.AlarmManager
import android.app.PendingIntent
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.io.File
import java.util.Calendar

object QuickLogScheduler {
  const val ALARM_ACTION = "com.filipkin.rightnow.QUICKLOG_ALARM"
  const val CHANNEL_ID = "hourly"
  const val NOTIF_ID = 4711
  private const val FLAGS = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

  private fun reminderFile(ctx: Context) = File(ctx.filesDir, "quicklog-reminder.json")

  private fun reminder(ctx: Context): JSONObject? {
    return try {
      val f = reminderFile(ctx)
      if (!f.exists()) null else JSONObject(f.readText())
    } catch (e: Exception) { null }
  }

  fun isEnabled(ctx: Context): Boolean = reminder(ctx)?.optBoolean("enabled", false) ?: false

  private fun nextHourBoundary(): Long {
    val c = Calendar.getInstance()
    c.add(Calendar.HOUR_OF_DAY, 1)
    c.set(Calendar.MINUTE, 0)
    c.set(Calendar.SECOND, 0)
    c.set(Calendar.MILLISECOND, 0)
    return c.timeInMillis
  }

  private fun alarmPi(ctx: Context): PendingIntent {
    val i = Intent(ctx, QuickLogAlarmReceiver::class.java).setAction(ALARM_ACTION)
    return PendingIntent.getBroadcast(ctx, 0, i, FLAGS)
  }

  fun arm(ctx: Context) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val at = nextHourBoundary()
    val pi = alarmPi(ctx)
    try {
      val exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
      if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
      else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    } catch (e: SecurityException) {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    }
  }

  fun disarm(ctx: Context) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.cancel(alarmPi(ctx))
    NotificationManagerCompat.from(ctx).cancel(NOTIF_ID)
  }

  fun ensureChannel(ctx: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val ch = android.app.NotificationChannel(CHANNEL_ID, "Hourly check-in", NotificationManager.IMPORTANCE_HIGH)
    nm.createNotificationChannel(ch)
  }

  fun bodyText(ctx: Context): String {
    val r = reminder(ctx)
    val streak0 = r?.optInt("streak0", 0) ?: 0
    val t0 = r?.optLong("t0", System.currentTimeMillis()) ?: System.currentTimeMillis()
    val cap = r?.optInt("cap", 24) ?: 24
    val elapsed = Math.max(0L, (System.currentTimeMillis() - t0) / 3600000L)
    var streak = streak0 + elapsed.toInt()
    if (streak > cap) streak = cap
    return if (streak >= 2) "What have you been doing the last " + streak + " hours? Tap to fill them in."
    else "What are you doing right now? Tap to log this hour."
  }

  fun postNotification(ctx: Context) {
    if (!isEnabled(ctx)) return
    ensureChannel(ctx)
    // Tap -> start the overlay service directly (no activity = no focus steal).
    val tapPi = PendingIntent.getService(ctx, 1, Intent(ctx, QuickLogService::class.java), FLAGS)
    // "Open in app" -> normal app launch (user explicitly chose to leave their app).
    val openIntent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
    val openPi = if (openIntent != null) PendingIntent.getActivity(ctx, 2, openIntent, FLAGS) else null
    val b = NotificationCompat.Builder(ctx, CHANNEL_ID)
      .setSmallIcon(ctx.applicationInfo.icon)
      .setContentTitle("RightNow")
      .setContentText(bodyText(ctx))
      .setContentIntent(tapPi)
      .setAutoCancel(true)
      .setOnlyAlertOnce(false)
      .setPriority(NotificationCompat.PRIORITY_MAX)
    if (openPi != null) b.addAction(0, "Open in app", openPi)
    try { NotificationManagerCompat.from(ctx).notify(NOTIF_ID, b.build()) } catch (e: Exception) {}
  }
}
`;

const ALARM_RECEIVER_KT = `package ${PKG}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class QuickLogAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    QuickLogScheduler.postNotification(context)
    QuickLogScheduler.arm(context) // chain the next hour
  }
}
`;

const BOOT_RECEIVER_KT = `package ${PKG}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class QuickLogBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (QuickLogScheduler.isEnabled(context)) QuickLogScheduler.arm(context)
  }
}
`;

const DRAIN_SERVICE_KT = `package ${PKG}

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class QuickLogDrainService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig {
    return HeadlessJsTaskConfig("RightNowQuickLogDrain", Arguments.createMap(), 60000, true)
  }
}
`;

const KICK_KT = `package ${PKG}

import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService

object HeadlessKick {
  fun kick(context: Context) {
    try {
      context.startService(Intent(context, QuickLogDrainService::class.java))
      HeadlessJsTaskService.acquireWakeLockNow(context)
    } catch (e: Exception) { /* periodic background-fetch drains later */ }
  }
}
`;

const SERVICE_KT = `package ${PKG}

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Calendar

class QuickLogService : Service() {
  private var windowManager: WindowManager? = null
  private var rootView: View? = null
  private var selectedActivity: Int = 0
  private var selectedActivityName: String = ""
  private var title: TextView? = null
  private var grid: GridLayout? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (rootView == null) showOverlay()
    return START_NOT_STICKY
  }

  private fun docFile(name: String): File = File(filesDir, name)

  private fun readActivities(): JSONArray {
    return try {
      val f = docFile("quicklog-taxonomy.json")
      if (!f.exists()) JSONArray() else JSONObject(f.readText()).optJSONArray("activities") ?: JSONArray()
    } catch (e: Exception) { JSONArray() }
  }

  private fun appendAnswer(activity: Int, feeling: Int?) {
    try {
      val now = Calendar.getInstance()
      now.add(Calendar.HOUR_OF_DAY, -1) // log the just-elapsed hour
      val date = "" + now.get(Calendar.YEAR) + "-" + (now.get(Calendar.MONTH) + 1) + "-" + now.get(Calendar.DAY_OF_MONTH)
      val hour = now.get(Calendar.HOUR_OF_DAY)
      val f = docFile("quicklog-queue.json")
      val arr = try { if (f.exists()) JSONArray(f.readText()) else JSONArray() } catch (e: Exception) { JSONArray() }
      val o = JSONObject()
      o.put("date", date); o.put("hour", hour); o.put("activity", activity)
      if (feeling == null) o.put("feeling", JSONObject.NULL) else o.put("feeling", feeling)
      o.put("ts", System.currentTimeMillis())
      arr.put(o)
      f.writeText(arr.toString())
    } catch (e: Exception) {}
  }

  private fun finishAnswer(activity: Int, feeling: Int?) {
    appendAnswer(activity, feeling)
    try { NotificationManagerCompat.from(this).cancel(QuickLogScheduler.NOTIF_ID) } catch (e: Exception) {}
    HeadlessKick.kick(applicationContext)
    teardown()
  }

  private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

  private fun showOverlay() {
    val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    windowManager = wm

    val scrim = LinearLayout(this)
    scrim.setBackgroundColor(Color.parseColor("#99000000"))
    scrim.gravity = Gravity.CENTER
    scrim.setOnClickListener { teardown() }

    val card = LinearLayout(this)
    card.orientation = LinearLayout.VERTICAL
    val cardBg = GradientDrawable()
    cardBg.setColor(Color.parseColor("#1c1c1e"))
    cardBg.cornerRadius = dp(16).toFloat()
    card.background = cardBg
    card.setPadding(dp(16), dp(16), dp(16), dp(16))
    card.setOnClickListener { }

    val t = TextView(this)
    t.text = "What are you doing right now?"
    t.setTextColor(Color.WHITE)
    t.textSize = 18f
    t.setPadding(0, 0, 0, dp(12))
    title = t
    card.addView(t)

    val g = GridLayout(this)
    g.columnCount = 2
    grid = g
    val activities = readActivities()
    for (i in 0 until activities.length()) {
      val a = activities.optJSONObject(i) ?: continue
      val idx = a.optInt("index", i)
      val name = a.optString("name", "?")
      val color = try { Color.parseColor(a.optString("color", "#888888")) } catch (e: Exception) { Color.GRAY }
      val skipFeeling = a.optBoolean("skipFeeling", false)
      val b = Button(this)
      b.text = name
      b.setTextColor(Color.WHITE)
      b.isAllCaps = false
      val bg = GradientDrawable()
      bg.setColor(color)
      bg.cornerRadius = dp(8).toFloat()
      b.background = bg
      val lp = GridLayout.LayoutParams()
      lp.width = dp(150)
      lp.height = dp(54)
      lp.setMargins(dp(4), dp(4), dp(4), dp(4))
      b.layoutParams = lp
      b.setOnClickListener {
        if (skipFeeling) finishAnswer(idx, null)
        else { selectedActivity = idx; selectedActivityName = name; showFeelings() }
      }
      g.addView(b)
    }
    val scroll = ScrollView(this)
    scroll.addView(g)
    card.addView(scroll)

    scrim.addView(card, LinearLayout.LayoutParams(dp(330), LinearLayout.LayoutParams.WRAP_CONTENT))

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else
      @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
      PixelFormat.TRANSLUCENT
    )
    rootView = scrim
    try { wm.addView(scrim, params) } catch (e: Exception) { teardown() }
  }

  private fun showFeelings() {
    val g = grid ?: return
    title?.text = "How are you feeling? (" + selectedActivityName + ")"
    g.removeAllViews()
    g.columnCount = 3
    val labels = arrayOf("Terrible", "Poor", "Ok", "Neutral", "Good", "Great")
    for (i in labels.indices) {
      val b = Button(this)
      b.text = labels[i]
      b.setTextColor(Color.WHITE)
      b.isAllCaps = false
      val bg = GradientDrawable()
      bg.setColor(Color.parseColor("#3a3a3c"))
      bg.cornerRadius = dp(8).toFloat()
      b.background = bg
      val lp = GridLayout.LayoutParams()
      lp.width = dp(100)
      lp.height = dp(54)
      lp.setMargins(dp(4), dp(4), dp(4), dp(4))
      b.layoutParams = lp
      val feeling = i
      b.setOnClickListener { finishAnswer(selectedActivity, feeling) }
      g.addView(b)
    }
  }

  private fun teardown() {
    try { rootView?.let { windowManager?.removeView(it) } } catch (e: Exception) {}
    rootView = null
    stopSelf()
  }

  override fun onDestroy() { teardown(); super.onDestroy() }
}
`;

const MODULE_KT = `package ${PKG}

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class QuickLogModule(rc: ReactApplicationContext) : ReactContextBaseJavaModule(rc) {
  override fun getName(): String = "QuickLog"

  @ReactMethod fun arm(promise: Promise) {
    try { QuickLogScheduler.arm(reactApplicationContext); promise.resolve(true) }
    catch (e: Exception) { promise.resolve(false) }
  }

  @ReactMethod fun disarm(promise: Promise) {
    try { QuickLogScheduler.disarm(reactApplicationContext); promise.resolve(true) }
    catch (e: Exception) { promise.resolve(false) }
  }

  @ReactMethod fun canDrawOverlay(promise: Promise) {
    val ok = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(reactApplicationContext)
    promise.resolve(ok)
  }

  @ReactMethod fun requestOverlayPermission(promise: Promise) {
    try {
      val i = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + reactApplicationContext.packageName))
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(i)
      promise.resolve(true)
    } catch (e: Exception) { promise.resolve(false) }
  }
}
`;

const PACKAGE_KT = `package ${PKG}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class QuickLogPackage : ReactPackage {
  override fun createNativeModules(rc: ReactApplicationContext): List<NativeModule> = listOf(QuickLogModule(rc))
  override fun createViewManagers(rc: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
`;

const FILES = {
  "QuickLogScheduler.kt": SCHEDULER_KT,
  "QuickLogAlarmReceiver.kt": ALARM_RECEIVER_KT,
  "QuickLogBootReceiver.kt": BOOT_RECEIVER_KT,
  "QuickLogDrainService.kt": DRAIN_SERVICE_KT,
  "HeadlessKick.kt": KICK_KT,
  "QuickLogService.kt": SERVICE_KT,
  "QuickLogModule.kt": MODULE_KT,
  "QuickLogPackage.kt": PACKAGE_KT,
};

function ensurePermission(manifest, name) {
  manifest.manifest["uses-permission"] = manifest.manifest["uses-permission"] || [];
  if (!manifest.manifest["uses-permission"].some((p) => p.$["android:name"] === name)) {
    manifest.manifest["uses-permission"].push({ $: { "android:name": name } });
  }
}

function withManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    ensurePermission(manifest, "android.permission.SYSTEM_ALERT_WINDOW");
    ensurePermission(manifest, "android.permission.SCHEDULE_EXACT_ALARM");
    ensurePermission(manifest, "android.permission.RECEIVE_BOOT_COMPLETED");

    app.service = app.service || [];
    const svc = app.service.map((s) => s.$["android:name"]);
    if (!svc.includes(".QuickLogService")) app.service.push({ $: { "android:name": ".QuickLogService", "android:exported": "false" } });
    if (!svc.includes(".QuickLogDrainService")) app.service.push({ $: { "android:name": ".QuickLogDrainService", "android:exported": "false" } });

    app.receiver = app.receiver || [];
    const rcv = app.receiver.map((r) => r.$["android:name"]);
    if (!rcv.includes(".QuickLogAlarmReceiver")) {
      app.receiver.push({ $: { "android:name": ".QuickLogAlarmReceiver", "android:exported": "false" } });
    }
    if (!rcv.includes(".QuickLogBootReceiver")) {
      app.receiver.push({
        $: { "android:name": ".QuickLogBootReceiver", "android:exported": "true" },
        "intent-filter": [{ action: [{ $: { "android:name": "android.intent.action.BOOT_COMPLETED" } }] }],
      });
    }
    return config;
  });
}

function withPackageRegistration(config) {
  return withMainApplication(config, (config) => {
    let src = config.modResults.contents;
    if (!src.includes("QuickLogPackage()")) {
      src = src.replace(
        /(PackageList\(this\)\.packages\.apply\s*\{)/,
        `$1\n            add(QuickLogPackage())`,
      );
    }
    config.modResults.contents = src;
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

module.exports = function withQuickLogOverlay(config) {
  config = withManifest(config);
  config = withPackageRegistration(config);
  config = withKotlinFiles(config);
  return config;
};
