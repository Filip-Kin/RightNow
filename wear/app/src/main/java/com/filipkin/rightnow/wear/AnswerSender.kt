package com.filipkin.rightnow.wear

import android.content.Context
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable

// Watch->phone answer. DataClient persists the item and replicates on reconnect, so an
// answer made while the phone is out of range / asleep still arrives later (the phone's
// RightNowWearListenerService consumes it, then deletes it).
object AnswerSender {
  // Unique path per answer so two distinct answers never collapse (DataClient dedups
  // identical path + payload). feeling == null is sent as -1 (skip-feeling activity).
  fun send(ctx: Context, date: String, hour: Int, activity: Int, feeling: Int?, ts: Long) {
    val req = PutDataMapRequest.create("/rightnow/answer/" + ts + "-" + hour)
    req.dataMap.putString("date", date)
    req.dataMap.putInt("hour", hour)
    req.dataMap.putInt("activity", activity)
    req.dataMap.putInt("feeling", feeling ?: -1)
    req.dataMap.putLong("ts", ts)
    val r = req.asPutDataRequest()
    r.setUrgent()
    Wearable.getDataClient(ctx).putDataItem(r)
  }
}
