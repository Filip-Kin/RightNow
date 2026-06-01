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
//
// NOTE: the scheduler and QuickLogModule here reference WearBridge (phone->watch
// DataItem pushes), which is provided by plugins/withWearBridge. That plugin MUST be
// registered alongside this one, or the build won't compile.
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
    // "Open in app" -> launch the app and route to the submission screen. The extra
    // is read by MainActivity/JS (see notification.ts) to push /log on launch.
    val openIntent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
    if (openIntent != null) {
      openIntent.putExtra("rightnow.open", "log")
      openIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    val openPi = if (openIntent != null) PendingIntent.getActivity(ctx, 2, openIntent, FLAGS) else null
    val b = NotificationCompat.Builder(ctx, CHANNEL_ID)
      .setSmallIcon(ctx.applicationInfo.icon)
      .setContentTitle("RightNow")
      .setContentText(bodyText(ctx))
      .setContentIntent(tapPi)
      .setAutoCancel(true)
      .setOnlyAlertOnce(false)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      // Don't auto-bridge to the watch: the Wear app posts its own prompt (whose tap
      // opens the watch UI). Bridging would show a duplicate on the wrist.
      .setLocalOnly(true)
    if (openPi != null) b.addAction(0, "Open in app", openPi)
    try { NotificationManagerCompat.from(ctx).notify(NOTIF_ID, b.build()) } catch (e: Exception) {}
    // Trigger the watch prompt for this hour (WearBridge lives in withWearBridge).
    // Carries the current streak baseline so the watch computes the same pending count.
    try {
      val r = reminder(ctx)
      val streak0 = r?.optInt("streak0", 0) ?: 0
      val t0 = r?.optLong("t0", System.currentTimeMillis()) ?: System.currentTimeMillis()
      val cap = r?.optInt("cap", 24) ?: 24
      WearBridge.putPrompt(ctx, streak0, t0, cap)
    } catch (e: Exception) {}
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
  // Outstanding hours to log, newest first (the streak from quicklog-reminder.json).
  // Each Calendar is the START of an elapsed hour block.
  private var pending: MutableList<Calendar> = ArrayList()
  private var stepIndex: Int = 0

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (rootView == null) { buildPending(); showOverlay() }
    return START_NOT_STICKY
  }

  private fun docFile(name: String): File = File(filesDir, name)

  private fun readActivities(): JSONArray {
    return try {
      val f = docFile("quicklog-taxonomy.json")
      if (!f.exists()) JSONArray() else JSONObject(f.readText()).optJSONArray("activities") ?: JSONArray()
    } catch (e: Exception) { JSONArray() }
  }

  // How many trailing hours are unlogged, per quicklog-reminder.json (streak0 +
  // hours elapsed since t0). Min 1 so the overlay always logs at least this hour.
  private fun pendingCount(): Int {
    return try {
      val f = docFile("quicklog-reminder.json")
      if (!f.exists()) return 1
      val o = JSONObject(f.readText())
      val streak0 = o.optInt("streak0", 0)
      val t0 = o.optLong("t0", System.currentTimeMillis())
      val cap = o.optInt("cap", 24)
      val elapsed = Math.max(0L, (System.currentTimeMillis() - t0) / 3600000L).toInt()
      Math.max(1, Math.min(streak0 + elapsed, cap))
    } catch (e: Exception) { 1 }
  }

  private fun buildPending() {
    pending = ArrayList()
    stepIndex = 0
    val n = pendingCount()
    // Oldest first, ending at the just-elapsed hour - matches the in-app catch-up
    // order so you fill the gap chronologically up to "right now".
    for (i in n downTo 1) {
      val c = Calendar.getInstance()
      c.add(Calendar.HOUR_OF_DAY, -i)
      c.set(Calendar.MINUTE, 0); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0)
      pending.add(c)
    }
  }

  private fun rangeLabelFor(c: Calendar): String {
    val end = (c.get(Calendar.HOUR_OF_DAY) + 1) % 24
    val start = c.get(Calendar.HOUR_OF_DAY)
    fun fmt(h: Int) = (if (h < 10) "0" else "") + h + ":00"
    return fmt(start) + " - " + fmt(end)
  }

  private fun appendAnswer(activity: Int, feeling: Int?) {
    try {
      val c = if (stepIndex < pending.size) pending[stepIndex] else Calendar.getInstance().apply { add(Calendar.HOUR_OF_DAY, -1) }
      val date = "" + c.get(Calendar.YEAR) + "-" + (c.get(Calendar.MONTH) + 1) + "-" + c.get(Calendar.DAY_OF_MONTH)
      val hour = c.get(Calendar.HOUR_OF_DAY)
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

  // Record the current hour's answer; advance to the next outstanding hour, or
  // finish (cancel notif + kick the headless drain) when all are done.
  private fun finishAnswer(activity: Int, feeling: Int?) {
    appendAnswer(activity, feeling)
    stepIndex++
    if (stepIndex < pending.size) {
      selectedActivity = 0
      selectedActivityName = ""
      showActivities()
    } else {
      try { NotificationManagerCompat.from(this).cancel(QuickLogScheduler.NOTIF_ID) } catch (e: Exception) {}
      HeadlessKick.kick(applicationContext)
      teardown()
    }
  }

  private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

  private var cardInnerW: Int = 0 // px available for the grid inside the card padding

  // The hour range for the current step, e.g. "15:00 - 16:00".
  private fun stepRange(): String {
    val c = if (stepIndex < pending.size) pending[stepIndex] else Calendar.getInstance()
    return rangeLabelFor(c)
  }
  // "(2 of 3)" when catching up, else empty.
  private fun stepCounter(): String {
    return if (pending.size > 1) "(" + (stepIndex + 1) + " of " + pending.size + ")" else ""
  }
  // Two centered lines: the prompt + range, then the counter on its own line.
  private fun stepTitle(prompt: String): String {
    val counter = stepCounter()
    val first = prompt + "  " + stepRange()
    return if (counter.isEmpty()) first else first + "\\n" + counter
  }

  private fun makeButton(label: String, fillColor: Int, columns: Int): Button {
    val b = Button(this)
    b.text = label
    b.setTextColor(Color.WHITE)
    b.isAllCaps = false
    b.textSize = 13f
    b.setPadding(dp(4), 0, dp(4), 0)
    val bg = GradientDrawable()
    bg.setColor(fillColor)
    bg.cornerRadius = dp(8).toFloat()
    b.background = bg
    val margin = dp(4)
    val lp = GridLayout.LayoutParams()
    // Width derived from the card's inner width so columns + margins never overflow.
    lp.width = (cardInnerW / columns) - margin * 2
    lp.height = dp(54)
    lp.setMargins(margin, margin, margin, margin)
    b.layoutParams = lp
    return b
  }

  private fun showOverlay() {
    val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    windowManager = wm

    val screenW = resources.displayMetrics.widthPixels
    val cardW = Math.min(screenW - dp(32), dp(360))
    cardInnerW = cardW - dp(32) // minus the card's horizontal padding

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
    t.setTextColor(Color.WHITE)
    t.textSize = 18f
    t.gravity = Gravity.CENTER_HORIZONTAL
    t.setPadding(0, 0, 0, dp(12))
    val tlp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    t.layoutParams = tlp
    title = t
    card.addView(t)

    val g = GridLayout(this)
    grid = g
    val scroll = ScrollView(this)
    scroll.addView(g)
    card.addView(scroll)

    scrim.addView(card, LinearLayout.LayoutParams(cardW, LinearLayout.LayoutParams.WRAP_CONTENT))

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
    try { wm.addView(scrim, params); showActivities() } catch (e: Exception) { teardown() }
  }

  // (Re)populate the grid with the activity choices for the current step.
  private fun showActivities() {
    val g = grid ?: return
    title?.text = stepTitle("What are you doing?")
    g.removeAllViews()
    g.columnCount = 2
    val activities = readActivities()
    for (i in 0 until activities.length()) {
      val a = activities.optJSONObject(i) ?: continue
      val idx = a.optInt("index", i)
      val name = a.optString("name", "?")
      val color = try { Color.parseColor(a.optString("color", "#888888")) } catch (e: Exception) { Color.GRAY }
      val skipFeeling = a.optBoolean("skipFeeling", false)
      val b = makeButton(name, color, 2)
      b.setOnClickListener {
        if (skipFeeling) finishAnswer(idx, null)
        else { selectedActivity = idx; selectedActivityName = name; showFeelings() }
      }
      g.addView(b)
    }
  }

  private fun showFeelings() {
    val g = grid ?: return
    title?.text = stepTitle(selectedActivityName + " - feeling?")
    g.removeAllViews()
    g.columnCount = 3
    val labels = arrayOf("Terrible", "Poor", "Ok", "Neutral", "Good", "Great")
    for (i in labels.indices) {
      val b = makeButton(labels[i], Color.parseColor("#3a3a3c"), 3)
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

  // One-shot: if the activity was launched via the notification's "Open in app"
  // action (extra rightnow.open=log), return that route and clear it so a later
  // resume doesn't re-trigger. JS calls this on launch/resume to push /log.
  @ReactMethod fun consumeLaunchRoute(promise: Promise) {
    try {
      val act = reactApplicationContext.currentActivity
      val intent = act?.intent
      val route = intent?.getStringExtra("rightnow.open")
      intent?.removeExtra("rightnow.open")
      promise.resolve(route)
    } catch (e: Exception) { promise.resolve(null) }
  }

  // Mirror the taxonomy/reminder plaintext state to the watch (WearBridge lives in
  // plugins/withWearBridge, which must be registered too). JS calls these alongside
  // its plaintext-file writes so the watch UI stays in sync.
  @ReactMethod fun pushTaxonomy(json: String, promise: Promise) {
    try { WearBridge.putState(reactApplicationContext, "/rightnow/taxonomy", json); promise.resolve(true) }
    catch (e: Exception) { promise.resolve(false) }
  }

  @ReactMethod fun pushReminder(json: String, promise: Promise) {
    try { WearBridge.putState(reactApplicationContext, "/rightnow/reminder", json); promise.resolve(true) }
    catch (e: Exception) { promise.resolve(false) }
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
