import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Icon } from "@/components/Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useConfig } from "@/lib/config";
import { clearHourlyPrompt } from "@/lib/hourlyReminder";
import { AnimatedText } from "@/components/AnimatedText";
import ProgressIndicator from "@/components/ProgressIndicator";
import { useFocusEffect, useRouter } from "expo-router";
import { getEntry, setEntry, setTransitEntry, useStoreLoaded, seedFilledFromStore } from "@/lib/entries";
import { isTransitActive } from "@/lib/timezone";
import { getToAsk, useToAsk, type HourSlot } from "@/lib/filledHours";
import { getDEK, useAuth } from "@/lib/auth";
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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const config = useConfig();
  const activities = useActivities();

  // Sleep (skip-feeling) renders full-width at the bottom, matching the overlay + watch.
  const orderedActivities = [
    ...activities.filter((a) => !a.skipFeeling),
    ...activities.filter((a) => a.skipFeeling),
  ];

  // The to-ask queue is sourced from the shared filled-ledger (the same source the
  // overlay + watch read), NOT derived live from the encrypted store - so a transient
  // store read can't balloon it to the full window (the old "jumped to 24 hours" bug).
  useAuth(); // re-render when the DEK arrives so `ready` flips
  const storeLoaded = useStoreLoaded();
  useToAsk(config.catchUpWindowHours); // subscribe so we re-render as the ledger changes
  // We can only trust the ledger once the store has loaded AND the DEK is available to
  // seed it from what's already logged on this device.
  const ready = storeLoaded && !!getDEK();

  // Snapshot the queue so it stays stable while we step/submit (filling an hour marks
  // it in the ledger, which would otherwise shift the list under the cursor). Re-taken
  // whenever the screen regains focus, the store loads, or the DEK arrives - /log is a
  // hidden tab screen that stays mounted, so reopening it an hour later must re-snapshot.
  const queueRef = useRef<HourSlot[] | null>(null);
  const [, forceRender] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [focusKey, setFocusKey] = useState(0);
  useFocusEffect(useCallback(() => setFocusKey((k) => k + 1), []));

  useEffect(() => {
    if (!ready) return;
    seedFilledFromStore(); // union this device's logged hours into the ledger first
    queueRef.current = getToAsk(Date.now(), config.catchUpWindowHours);
    setCursor(0);
    forceRender((n) => n + 1);
  }, [ready, focusKey, config.catchUpWindowHours]);

  const queue = queueRef.current ?? [];
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

  // Finished the queue (or nothing to log) -> leave the flow. Only once we've actually
  // computed the queue (ready + snapshotted); never while still waiting on store/DEK.
  useEffect(() => {
    if (ready && queueRef.current !== null && !slot) {
      if (router.canDismiss()) router.dismiss();
      else router.navigate("/");
    }
  }, [slot, ready]);

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
    // While traveling, log hours as "transit" cells (the resample buffer) so they
    // get fitted to the grid on arrival and never clobber origin-timezone data.
    const write = isTransitActive()
      ? setTransitEntry(slot.date, slot.hour, activityIndex, feeling)
      : setEntry(slot.date, slot.hour, activityIndex, feeling, "manual");
    write.catch((e) => {
      console.error(e);
      alert(String(e));
    });
    void clearHourlyPrompt(); // answered in-app: clear the phone + watch notifications
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
        <View style={styles.progressWrap}>
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
          justifyContent: "flex-start",
          marginBottom: 32,
        }}
      >
        <Text style={styles.label}>Select an Activity:</Text>
        <View style={styles.activityGrid}>
          {orderedActivities.map((activity) => (
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
                activity.skipFeeling ? { width: "100%" } : {},
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
    fontSize: 30,
    lineHeight: 38,
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
    marginTop: 8,
    marginBottom: 28,
  },
  progressWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
});
