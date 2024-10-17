import React, { useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Icon, IconName, VerySadIcon } from "@/components/Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hoursBehindCount, useConfig } from "@/lib/config";
import { AnimatedText } from "@/components/AnimatedText";
import ProgressIndicator from "@/components/ProgressIndicator";
import { useDate } from "@/lib/time";
import { useRouter } from "expo-router";

interface Activity {
  name: string;
  color: string;
  icon: IconName;
}

const activityList: Activity[] = [
  { name: "Sleep", color: "#273036", icon: "bed" },
  { name: "Dating", color: "#C61533", icon: "favorite" },
  { name: "Friends", color: "#005744", icon: "person" },
  { name: "Work", color: "#005744", icon: "work" },
  { name: "Health", color: "#01A9B3", icon: "fitness-center" },
  { name: "Art", color: "#199748", icon: "brush" },
  { name: "Productive", color: "#FFF335", icon: "precision-manufacturing" },
  { name: "Hobbies", color: "#FF6D01", icon: "sports-esports" },
  { name: "Leisure", color: "#5B3AB0", icon: "tv" },
  { name: "Waste", color: "#FF2917", icon: "delete" },
  { name: "Transition", color: "#BFFF56", icon: "transit-enterexit" },
];

const feelingList = [
  "Terrible",
  "Poor",
  "Ok",
  "Neutral",
  "Good",
  "Great",
];

const feelingIcons = [
  ({ color }: any) => <VerySadIcon color={color} />,
  ({ color }: any) => <Icon color={color} name="sentiment-very-dissatisfied" />,
  ({ color }: any) => <Icon color={color} name="sentiment-dissatisfied" />,
  ({ color }: any) => <Icon color={color} name="sentiment-neutral" />,
  ({ color }: any) => <Icon color={color} name="sentiment-satisfied" />,
  ({ color }: any) => <Icon color={color} name="sentiment-satisfied-alt" />,
];

function roundToNextHour(input: number): Date {
  const date = new Date(input);
  date.setMinutes(0);
  date.setSeconds(0);
  date.setMilliseconds(0);
  return date;
}

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

  const currentTime = roundToNextHour(config.lastSync);

  const firstTime = useRef(currentTime);
  const [submissionCount, setSubmissionCount] = useState(0);

  const rightNow = useDate("hourly");
  const behindCount = hoursBehindCount(
    firstTime.current.getTime(),
    rightNow.getTime(),
  );

  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);
  const [selectedFeeling, setSelectedFeeling] = useState(-1);

  const handleContinue = () => {
    // Handle the continue action
    console.log("Activity:", selectedActivity);
    console.log("Feeling:", feelingList[selectedFeeling]);

    // uhm yeah its actually pushed forward by one hour lol
    const submitDate = new Date(currentTime.getTime() + (1_000 * 60 * 60));
    const urls = [
      `${config.endpoint}/waydrn/${submitDate.getFullYear()}-${submitDate.getMonth() + 1}-${submitDate.getDate()}/${submitDate.getHours()}/${activityList.findIndex((activity) => activity.name === selectedActivity) + 1}`,
      `${config.endpoint}/hayfrn/${submitDate.getFullYear()}-${submitDate.getMonth() + 1}-${submitDate.getDate()}/${submitDate.getHours()}/${selectedFeeling + 1}`
    ];
    console.log(urls);

    (async() => {
      for (const url of urls) {
        try {
          const resp = await fetch(url, { method: 'POST', body: "abc" })
          if (!resp.ok) {
            throw new Error(`Failed to submit data to ${url}: ${resp.status} ${resp.statusText}`);
          }
          const result = await resp.text();
          console.log('done!', result);
        } catch (e) {
          console.error(e);
          alert(String(e));
        }
      }
    })();

    setSelectedActivity(null);
    setSelectedFeeling(-1);
    config.lastSync = currentTime.getTime() + (1_000 * 60 * 60);
    setSubmissionCount(submissionCount + 1);

    if (submissionCount + 1 === behindCount) {
      // We've reached the end
      if (router.canDismiss()) {
        router.dismiss();
      } else {
        router.navigate("/");
      }
    }
  };

  if (submissionCount === behindCount) {
    // We've reached the end
    if (router.canDismiss()) {
      router.dismiss();
    } else {
      router.navigate("/");
    }
  }

  return (
    <View style={styles.modalContent}>
      <View style={styles.timeText}>
        {hourLabel((currentTime.getHours()) % 24, config.hour24)}
        <Text style={styles.timeTextLabel}>-</Text>
        {hourLabel((currentTime.getHours() + 1) % 24, config.hour24)}

        <Text style={styles.timeTextLabel}>&nbsp;on&nbsp;</Text>
        <AnimatedText text={`${monthNames[currentTime.getMonth()]}`} />
        <Text style={styles.timeTextLabel}>&nbsp;</Text>
        <AnimatedText text={`${currentTime.getDate()}`} />
      </View>
      <ProgressIndicator current={submissionCount} total={behindCount} />
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
          {activityList.map((activity, index) => (
            <TouchableOpacity
              key={index}
              style={[
                {
                  backgroundColor: activity.name === selectedActivity
                    ? lightenColor(activity.color, 20)
                    : activity.color,
                  borderColor: activity.color,
                },
                styles.activityButton,
                selectedActivity === activity.name && styles.selectedActivity,
                activityList.length % 2 !== 0 && index === 0
                  ? { width: "100%" }
                  : {},
              ]}
              onPress={() => setSelectedActivity(activity.name)}
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
          {submissionCount + 1 === behindCount ? "Finish" : "Next Entry"}
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

function getContrastingTextColor(hexColor: string): string {
  // Remove the hash at the start if it's there
  hexColor = hexColor.replace(/^#/, "");

  // Parse the r, g, b values
  const r = parseInt(hexColor.substr(0, 2), 16);
  const g = parseInt(hexColor.substr(2, 2), 16);
  const b = parseInt(hexColor.substr(4, 2), 16);

  // Calculate the relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return black for light backgrounds and white for dark backgrounds
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}

function lightenColor(hexColor: string, percent: number): string {
  // Remove the hash at the start if it's there
  hexColor = hexColor.replace(/^#/, "");

  // Parse the r, g, b values
  let r = parseInt(hexColor.substr(0, 2), 16);
  let g = parseInt(hexColor.substr(2, 2), 16);
  let b = parseInt(hexColor.substr(4, 2), 16);

  // Increase each channel by the given percentage
  r = Math.min(255, Math.floor(r * (1 + percent / 100)));
  g = Math.min(255, Math.floor(g * (1 + percent / 100)));
  b = Math.min(255, Math.floor(b * (1 + percent / 100)));

  // Convert back to hex and return
  return `#${r.toString(16).padStart(2, "0")}${
    g.toString(16).padStart(2, "0")
  }${b.toString(16).padStart(2, "0")}`;
}
