package com.filipkin.rightnow.wear

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

// The watch-local hourly prompt. Posted when a /rightnow/prompt DataItem arrives from
// the phone; tapping it opens QuickLogActivity (a bridged phone notification's tap would
// run on the phone, so the watch posts its own to host a watch-native screen).
object PromptNotifier {
  const val CHANNEL_ID = "hourly"
  const val NOTIF_ID = 4712

  private fun ensureChannel(ctx: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Hourly check-in", NotificationManager.IMPORTANCE_HIGH))
  }

  fun show(ctx: Context) {
    ensureChannel(ctx)
    val i = Intent(ctx, QuickLogActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    val pi = PendingIntent.getActivity(ctx, 0, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val n = NotificationCompat.Builder(ctx, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_popup_reminder)
      .setContentTitle("RightNow")
      .setContentText("What are you doing? Tap to log.")
      .setContentIntent(pi)
      .setAutoCancel(true)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .build()
    try { NotificationManagerCompat.from(ctx).notify(NOTIF_ID, n) } catch (e: Exception) {}
  }

  fun cancel(ctx: Context) {
    try { NotificationManagerCompat.from(ctx).cancel(NOTIF_ID) } catch (e: Exception) {}
  }
}
