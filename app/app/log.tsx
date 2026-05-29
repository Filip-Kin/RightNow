import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Icon } from "@/components/Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useConfig } from "@/lib/config";
import { AnimatedText } from "@/components/AnimatedText";
import ProgressIndicator from "@/components/ProgressIndicator";
import { useRouter } from "expo-router";
import { setEntry, useStoreLoaded, useUnloggedHours } from "@/lib/entries";
import { useActivities } from "@/lib/activities";
import {
  feelingIcons,
  feelings as feelingList,
  getContrastingTextColor,
  lightenColor,
} from "@/lib/activities";

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
  const router = useRouter();
  const config = useConfig();
  const activities = useActivities();

  // Live list of unlogged hour blocks (oldest first). It shrinks as we submit,
  // so we always render its first slot and dismiss when it's empty.
  const unlogged = useUnloggedHours(config.catchUpWindowHours);
  const storeLoaded = useStoreLoaded();
  const slot = unlogged[0];

  // Peak length seen this session = the total for the progress bar (the list
  // starts empty before the store loads, then settles at the real count).
  const totalRef = useRef(0);
  if (unlogged.length > totalRef.current) totalRef.current = unlogged.length;
  const total = totalRef.current;
  const done = total - unlogged.length;

  const [selectedActivity, setSelectedActivity] = useState<number | null>(null);
  const [selectedFeeling, setSelectedFeeling] = useState(-1);

  // Nothing left to log (caught up, or finished the queue) -> leave the flow.
  // Wait for the store to load so we don't dismiss before knowing what's unlogged.
  useEffect(() => {
    if (storeLoaded && !slot) {
      if (router.canDismiss()) router.dismiss();
      else router.navigate("/");
    }
  }, [slot, storeLoaded]);

  if (!slot) return <View style={styles.modalContent} />;

  const [y, mo, d] = slot.date.split("-").map(Number);
  const slotTime = new Date(y, mo - 1, d, slot.hour);
  const isLast = unlogged.length === 1;

  const handleContinue = () => {
    // Encrypt locally and push to the server (optimistic; offline-safe).
    setEntry(slot.date, slot.hour, selectedActivity, selectedFeeling, "manual").catch((e) => {
      console.error(e);
      alert(String(e));
    });
    setSelectedActivity(null);
    setSelectedFeeling(-1);
    // The store update removes this slot from `unlogged`, advancing to the next.
  };

  return (
    <View style={styles.modalContent}>
      <View style={styles.timeText}>
        {hourLabel(slot.hour % 24, config.hour24)}
        <Text style={styles.timeTextLabel}>-</Text>
        {hourLabel((slot.hour + 1) % 24, config.hour24)}

        <Text style={styles.timeTextLabel}>&nbsp;on&nbsp;</Text>
        <AnimatedText text={`${monthNames[slotTime.getMonth()]}`} />
        <Text style={styles.timeTextLabel}>&nbsp;</Text>
        <AnimatedText text={`${slotTime.getDate()}`} />
      </View>
      <ProgressIndicator current={done} total={total} />
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
              onPress={() => setSelectedActivity(activity.index)}
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
            const color = selectedFeeling === index ? "#007bff" : "#000000";
            return (
              <TouchableOpacity
                key={index}
                style={styles.feelingItem}
                onPress={() => {
                  setSelectedFeeling(index);
                }}
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
      <TouchableOpacity
        style={[
          styles.continueButton,
          (selectedActivity === null || selectedFeeling === -1) ? { backgroundColor: "#ccc" } : {}
        ]}
        onPress={handleContinue}
        disabled={selectedActivity === null || selectedFeeling === -1}
      >
        <Text style={styles.continueButtonText}>
          {isLast ? "Finish" : "Next Entry"}
        </Text>
      </TouchableOpacity>
      <View style={{ height: useSafeAreaInsets().bottom }}></View>
    </View>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    backgroundColor: "white",
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
  },
  label: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
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
    borderColor: "black",
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
  },
  continueButton: {
    backgroundColor: "#007bff",
    padding: 15,
    borderRadius: 5,
    alignItems: "center",
  },
  continueButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
});
