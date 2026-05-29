// Editor for the user's custom activity taxonomy. Reads/writes the synced store
// in lib/activities.tsx; every change marks it dirty and gets pushed (encrypted)
// by the entries sync. Entries reference activities by their integer `index`, so
// the index is editable but must stay unique.
import React, { useMemo, useState } from "react";
import {
  Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { ScreenContainer } from "@/components/ScreenContainer";
import { getAllEntries } from "@/lib/entries";
import {
  ActivityDef, COLOR_CHOICES, getContrastingTextColor, ICON_CHOICES,
  nextFreeIndex, removeActivity, upsertActivity, useActivities,
} from "@/lib/activities";

export default function ActivitiesScreen() {
  const activities = useActivities();
  // `draft` is the activity being edited; `originalIndex` tracks an in-flight
  // index change so we can drop the old slot. null = editor closed.
  const [draft, setDraft] = useState<ActivityDef | null>(null);
  const [originalIndex, setOriginalIndex] = useState<number | null>(null);

  function openNew() {
    setOriginalIndex(null);
    setDraft({ index: nextFreeIndex(), name: "", color: COLOR_CHOICES[0], icon: ICON_CHOICES[0] });
  }
  function openEdit(a: ActivityDef) {
    setOriginalIndex(a.index);
    setDraft({ ...a });
  }

  return (
    <ScreenContainer>
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.hint}>
          Tap an activity to edit it. The number is its stored index — historical data and imports map
          to activities by this number.
        </Text>
        {activities.map((a) => (
          <TouchableOpacity key={a.index} style={styles.row} onPress={() => openEdit(a)}>
            <View style={[styles.swatch, { backgroundColor: a.color }]}>
              <Icon name={a.icon} style={{ color: getContrastingTextColor(a.color) }} />
            </View>
            <Text style={styles.rowName}>{a.name || "(unnamed)"}</Text>
            <Text style={styles.rowIndex}>#{a.index}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.addButton} onPress={openNew}>
          <Icon name="add" style={{ color: "#1a73e8" }} />
          <Text style={styles.addText}>Add activity</Text>
        </TouchableOpacity>
      </ScrollView>

      {draft && (
        <Editor
          draft={draft}
          originalIndex={originalIndex}
          existing={activities}
          onChange={setDraft}
          onClose={() => setDraft(null)}
        />
      )}
    </SafeAreaView>
    </ScreenContainer>
  );
}

function Editor({ draft, originalIndex, existing, onChange, onClose }: {
  draft: ActivityDef;
  originalIndex: number | null;
  existing: ActivityDef[];
  onChange: (d: ActivityDef) => void;
  onClose: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Entry count for the slot being edited, to warn before deleting real data.
  const entryCount = useMemo(() => {
    if (originalIndex === null) return 0;
    return getAllEntries().filter((e) => e.activity === originalIndex).length;
  }, [originalIndex]);

  const indexTaken = existing.some((a) => a.index === draft.index && a.index !== originalIndex);
  const valid = draft.name.trim().length > 0 && Number.isInteger(draft.index) && draft.index >= 0 && !indexTaken;

  function save() {
    if (!valid) return;
    if (originalIndex !== null && originalIndex !== draft.index) removeActivity(originalIndex);
    upsertActivity({ ...draft, name: draft.name.trim() });
    onClose();
  }

  function del() {
    if (originalIndex === null) return;
    removeActivity(originalIndex);
    onClose();
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{originalIndex === null ? "New activity" : "Edit activity"}</Text>

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={draft.name}
              onChangeText={(name) => onChange({ ...draft, name })}
              placeholder="e.g. Robots"
              autoFocus
            />

            <Text style={styles.fieldLabel}>Index</Text>
            <TextInput
              style={[styles.input, indexTaken && styles.inputError]}
              value={String(draft.index)}
              onChangeText={(t) => onChange({ ...draft, index: parseInt(t.replace(/[^0-9]/g, "") || "0", 10) })}
              keyboardType="number-pad"
            />
            {indexTaken && <Text style={styles.errorText}>Index #{draft.index} is already used.</Text>}

            <Text style={styles.fieldLabel}>Color</Text>
            <View style={styles.choiceWrap}>
              {COLOR_CHOICES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorChoice, { backgroundColor: c }, draft.color === c && styles.choiceSelected]}
                  onPress={() => onChange({ ...draft, color: c })}
                >
                  {draft.color === c && <Icon name="check" style={{ color: getContrastingTextColor(c) }} />}
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Icon</Text>
            <View style={styles.choiceWrap}>
              {ICON_CHOICES.map((ic) => (
                <TouchableOpacity
                  key={ic}
                  style={[styles.iconChoice, draft.icon === ic && styles.choiceSelected]}
                  onPress={() => onChange({ ...draft, icon: ic })}
                >
                  <Icon name={ic} style={{ color: draft.icon === ic ? "#1a73e8" : "#444" }} />
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, !valid && styles.saveBtnDisabled]} onPress={save} disabled={!valid}>
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>

            {originalIndex !== null && (
              confirmDelete ? (
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmText}>
                    Delete this activity?{entryCount > 0
                      ? ` ${entryCount} logged hour${entryCount === 1 ? "" : "s"} will show as "Unknown #${originalIndex}".`
                      : ""}
                  </Text>
                  <View style={styles.modalActions}>
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmDelete(false)}>
                      <Text style={styles.cancelText}>Keep</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteBtn} onPress={del}>
                      <Text style={styles.saveText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={styles.deleteLink} onPress={() => setConfirmDelete(true)}>
                  <Text style={styles.deleteLinkText}>Delete activity</Text>
                </TouchableOpacity>
              )
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  hint: { color: "#5f6368", fontSize: 13, marginBottom: 12, lineHeight: 18 },
  row: {
    flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1,
    borderBottomColor: "#eee", gap: 12,
  },
  swatch: { width: 40, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rowName: { flex: 1, fontSize: 16, color: "#111", fontWeight: "500" },
  rowIndex: { color: "#9aa0a6", fontSize: 14, fontVariant: ["tabular-nums"] },
  addButton: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 16 },
  addText: { color: "#1a73e8", fontSize: 16, fontWeight: "600" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: "90%" },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 12, color: "#111" },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: "#3c4043", marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#dadce0", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: "#111" },
  inputError: { borderColor: "#d93025" },
  errorText: { color: "#d93025", fontSize: 12, marginTop: 4 },
  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  colorChoice: { width: 40, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
  iconChoice: { width: 44, height: 44, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#eee", backgroundColor: "#fafafa" },
  choiceSelected: { borderColor: "#1a73e8" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 20 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelText: { color: "#5f6368", fontSize: 16, fontWeight: "600" },
  saveBtn: { backgroundColor: "#1a73e8", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  saveBtnDisabled: { backgroundColor: "#b0c5e8" },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  deleteBtn: { backgroundColor: "#d93025", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  deleteLink: { marginTop: 18, alignItems: "center" },
  deleteLinkText: { color: "#d93025", fontSize: 15, fontWeight: "600" },
  confirmRow: { marginTop: 18, padding: 12, backgroundColor: "#fce8e6", borderRadius: 8 },
  confirmText: { color: "#5f1f1a", fontSize: 14, lineHeight: 19 },
});
