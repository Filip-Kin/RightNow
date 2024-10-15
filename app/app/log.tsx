import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Slider from "@react-native-community/slider";
import { Icon, IconName, VerySadIcon } from "@/components/Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

export default function Index() {
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);
  const [selectedFeeling, setSelectedFeeling] = useState(-1);
  const [isModalVisible, setModalVisible] = useState(false);

  const toggleModal = () => {
    setModalVisible(!isModalVisible);
  };

  const handleContinue = () => {
    // Handle the continue action
    console.log("Activity:", selectedActivity);
    console.log("Feeling:", feelingList[selectedFeeling]);
    toggleModal();
  };

  const currentTime = new Date().toLocaleString("en-US", {
    hour: "numeric",
    minute: "numeric",
    hour12: true,
    month: "short",
    day: "numeric",
  });

  return (
    <View style={styles.modalContent}>
      <Text style={styles.timeText}>{currentTime}</Text>
      <Text style={styles.label}>Select an Activity:</Text>
      <View style={styles.activityGrid}>
        {activityList.map((activity, index) => (
          <TouchableOpacity
            key={index}
            style={[
              {
                backgroundColor: activity.name === selectedActivity ? lightenColor(activity.color, 20) : activity.color,
                borderColor: activity.color,
              },
              styles.activityButton,
              selectedActivity === activity.name && styles.selectedActivity,
            ]}
            onPress={() => setSelectedActivity(activity.name)}
          >
            <Icon style={{ color: getContrastingTextColor(activity.color) }} name={activity.icon} />
            <Text style={{ color: getContrastingTextColor(activity.color) }}>{activity.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.label}>How are you feeling?</Text>
      <View style={styles.activityGrid}>
        {feelingList.map((feeling, index) => {
          const color = selectedFeeling === index ? "#007bff" : "#000000";
          return(
          <TouchableOpacity style={styles.feelingItem} onPress={() => {
            setSelectedFeeling(index);
          }}>
            <Text key={index} style={{ textAlign: "center", color, marginBottom: 2, fontWeight: '500' }}>
              {feeling}
            </Text>
            {feelingIcons[index]({ color })}
          </TouchableOpacity>
        );})}
      </View>
      <Text style={styles.feelingText}>{feelingList[selectedFeeling]}</Text>
      <View style={{ flex: 1 }}></View>
      <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
        <Text style={styles.continueButtonText}>Continue</Text>
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
    fontSize: 36,
    fontWeight: "normal",
    marginBottom: 20,
    textAlign: "center",
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
  },
  selectedActivity: {
    borderColor: 'black', 
  },
  slider: {
    width: "100%",
    height: 40,
  },
  feelingItem: {
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
  hexColor = hexColor.replace(/^#/, '');

  // Parse the r, g, b values
  const r = parseInt(hexColor.substr(0, 2), 16);
  const g = parseInt(hexColor.substr(2, 2), 16);
  const b = parseInt(hexColor.substr(4, 2), 16);

  // Calculate the relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return black for light backgrounds and white for dark backgrounds
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

function lightenColor(hexColor: string, percent: number): string {
  // Remove the hash at the start if it's there
  hexColor = hexColor.replace(/^#/, '');

  // Parse the r, g, b values
  let r = parseInt(hexColor.substr(0, 2), 16);
  let g = parseInt(hexColor.substr(2, 2), 16);
  let b = parseInt(hexColor.substr(4, 2), 16);

  // Increase each channel by the given percentage
  r = Math.min(255, Math.floor(r * (1 + percent / 100)));
  g = Math.min(255, Math.floor(g * (1 + percent / 100)));
  b = Math.min(255, Math.floor(b * (1 + percent / 100)));

  // Convert back to hex and return
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}