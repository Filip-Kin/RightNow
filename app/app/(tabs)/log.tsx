import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Icon } from "@/components/Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useConfig } from "@/lib/config";
import { AnimatedText } from "@/components/AnimatedText";
import ProgressIndicator from "@/components/ProgressIndicator";
import { useRouter } from "expo-router";
import { getEntry, setEntry, useStoreLoaded, useUnloggedHours, type HourSlot } from "@/lib/entries";
import { ScreenContainer } from "@/components/ScreenContainer";
import { useActivities } from "@/lib/activities";
import {
  feelingIcons,
  feelings as feelingList,
  getContrastingTextColor,
  lightenColor,
} from "@/lib/activities";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function hourLabel(hour: number, hour24: boolean) {
  if (hour24) {
    return (
      <>
        <AnimatedText text={`${hour}`} />
        <AnimatedText text={`:00`} />
      </>
    );
  } else {
    return (
      <>
        <AnimatedText text={`${hour % 12 || 12}`} />
        <AnimatedText text={` ${hour < 12 ? "AM" : "PM"}`} />
      </>
    );
  }
}

export default function Index() {
  const c = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const config = useConfig();
  const activities = useActivities();

  const unlogged = useUnloggedHours(config.catchUpWindowHours);
  const storeLoaded = useStoreLoaded();

  // Snapshot the unlogged queue once the store has loaded so it stays stable as we
  // submit — that's what lets us step backward/forward through it.
  const queueRef = useRef<HourSlot[] | null>(null);
  if (queueRef.current === null && storeLoaded) queueRef.current = unlogged;
  const queue = queueRef.current ?? [];

  const [cursor, setCursor] = useState(0);
  const slot = queue[cursor];

  const [selectedActivity, setSelectedActivity] = useState<number | null>(null);
  const [selectedFeeling, setSelectedFeeling] = useState(-1);

  // Pre-fill from any saved entry when the slot changes, so a revisited slot shows
  // your previous choice (and tapping a different option re-submits it).
  useEffect(() => {
    if (!slot) return;
    const e = getEntry(slot.date, slot.hour);
    setSelectedActivity(e?.activity ?? null);
    setSelectedFeeling(e?.feeling ?? -1);
  }, [cursor, slot?.date, slot?.hour]);

  // Finished the queue (or nothing to log) -> leave the flow. Wait for the store to
  // load so we don't dismiss before knowing what's unlogged.
  useEffect(() => {
    if (storeLoaded && !slot) {
      if (router.canDismiss()) router.dismiss();
      else router.navigate("/");
    }
  }, [slot, storeLoaded]);

  if (!slot) return <View style={[styles.modalContent, { paddingTop: insets.top + 8 }]} />;

  const [y, mo, d] = slot.date.split("-").map(Number);
  const slotTime = new Date(y, mo - 1, d, slot.hour);
  const isLast = cursor >= queue.length - 1;
  const canForward = !isLast && !!getEntry(slot.date, slot.hour); // only when reviewing a saved slot

  const advance = () => {
    if (cursor + 1 >= queue.length) {
      if (router.canDismiss()) router.dismiss();
      else router.navigate("/");
    } else {
      setCursor((c) => c + 1);
    }
  };

  // Save the current slot, then move on. The pre-fill effect resets the selection.
  const submit = (activityIndex: number | null, feeling: number | null) => {
    setEntry(slot.date, slot.hour, activityIndex, feeling, "manual").catch((e) => {
      console.error(e);
      alert(String(e));
    });
    advance();
  };

  // Auto-submit: a "skip feeling" activity (e.g. Sleep) submits instantly with no
  // feeling; any other submits as soon as both an activity and a feeling are chosen.
  const handleActivityPress = (activity: { index: number; skipFeeling?: boolean }) => {
    if (activity.skipFeeling) return submit(activity.index, null);
    if (selectedFeeling >= 0) return submit(activity.index, selectedFeeling);
    setSelectedActivity(activity.index);
  };

  const handleFeelingPress = (i: number) => {
    if (selectedActivity !== null) return submit(selectedActivity, i);
    setSelectedFeeling(i);
  };

  return (
    <ScreenContainer>
    <View style={[styles.modalContent, { paddingTop: insets.top + 8 }]}>
      <View style={styles.timeText}>
        {hourLabel(slot.hour % 24, config.hour24)}
        <Text style={styles.timeTextLabel}>-</Text>
        {hourLabel((slot.hour + 1) % 24, config.hour24)}

        <Text style={styles.timeTextLabel}>&nbsp;on&nbsp;</Text>
        <AnimatedText text={`${monthNames[slotTime.getMonth()]}`} />
        <Text style={styles.timeTextLabel}>&nbsp;</Text>
        <AnimatedText text={`${slotTime.getDate()}`} />
      </View>
      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.navBtn, cursor === 0 && styles.navBtnDisabled]}
          onPress={() => cursor > 0 && setCursor((c) => c - 1)}
          disabled={cursor === 0}
        >
          <Icon name="arrow-back" style={{ color: cursor === 0 ? c.textFaint : c.primary }} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ProgressIndicator current={cursor} total={queue.length} />
        </View>
        <TouchableOpacity
          style={[styles.navBtn, !canForward && styles.navBtnDisabled]}
          onPress={() => canForward && setCursor((c) => c + 1)}
          disabled={!canForward}
        >
          <Icon name="arrow-forward" style={{ color: canForward ? c.primary : c.textFaint }} />
        </TouchableOpacity>
      </View>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 32,
        }}
      >
        <Text style={styles.label}>Select an Activity:</Text>
        <View style={styles.activityGrid}>
          {activities.map((activity, index) => (
            <TouchableOpacity
              key={activity.index}
              style={[
                {
                  backgroundColor: activity.index === selectedActivity
                    ? lightenColor(activity.color, 20)
                    : activity.color,
                  borderColor: activity.color,
                },
                styles.activityButton,
                selectedActivity === activity.index && styles.selectedActivity,
                activities.length % 2 !== 0 && index === 0
                  ? { width: "100%" }
                  : {},
              ]}
              onPress={() => handleActivityPress(activity)}
            >
              <Icon
                style={{ color: getContrastingTextColor(activity.color) }}
                name={activity.icon}
              />
              <Text style={{ color: getContrastingTextColor(activity.color) }}>
                {activity.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>How are you feeling?</Text>
        <View style={styles.activityGrid}>
          {feelingList.map((feeling, index) => {
            const color = selectedFeeling === index ? c.primary : c.text;
            return (
              <TouchableOpacity
                key={index}
                style={styles.feelingItem}
                onPress={() => handleFeelingPress(index)}
              >
                <Text
                  key={index}
                  style={{
                    textAlign: "center",
                    color,
                    marginBottom: 2,
                    fontWeight: "500",
                  }}
                >
                  {feeling}
                </Text>
                {feelingIcons[index]({ color })}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <Text style={styles.hintText}>
        {isLast ? "Last one — pick to finish" : "Pick an activity and a feeling to save"}
      </Text>
      <View style={{ height: useSafeAreaInsets().bottom }}></View>
    </View>
    </ScreenContainer>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  modalContent: {
    backgroundColor: c.bg,
    padding: 20,
    borderRadius: 10,
    flex: 1,
  },
  timeText: {
    fontWeight: "normal",
    textAlign: "center",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  timeTextLabel: {
    fontSize: 42,
    color: c.text,
  },
  label: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
    color: c.text,
  },
  activityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  activityButton: {
    borderWidth: 4,
    width: "48%",
    padding: 5,
    marginBottom: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 5,
    flexDirection: "row",
    height: 64,
  },
  selectedActivity: {
    borderColor: c.text,
  },
  slider: {
    width: "100%",
    height: 40,
  },
  feelingItem: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  feelingText: {
    textAlign: "center",
    marginVertical: 10,
    fontSize: 16,
    color: c.text,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.primarySoft,
  },
  navBtnDisabled: {
    backgroundColor: c.surface2,
  },
  hintText: {
    textAlign: "center",
    color: c.textFaint,
    fontSize: 13,
    paddingVertical: 8,
  },
});
