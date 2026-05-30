// User-customizable activity taxonomy + the fixed feeling scale.
//
// Activities are user data: each has a stable integer `index` (what entries store,
// matching the original WAYDRN model) plus a display name, color, and icon. The
// app ships DEFAULT_ACTIVITIES, but the user can modify/add/remove them.
//
// Because entries reference activities by index, the definitions must travel with
// the account (a fresh device pulls entries as opaque indices and needs the names
// /colors to render them). They sync as ONE reserved encrypted "config cell" that
// rides the existing entries.push/pull (see configCellId / sealJson in crypto.ts).
// This module owns the local store + serialization; entries.ts orchestrates the
// actual network sync (it subscribes here for push, and routes the pulled config
// cell back into applyPulledConfig) so there's no circular import.
import React from "react";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Icon, IconName, VerySadIcon } from "@/components/Icon";
import { configCellId, openJson, sealJson } from "./crypto";

export interface ActivityDef {
  index: number;
  name: string;
  color: string;
  icon: IconName;
  // When true, selecting this activity in the log flow submits immediately with no
  // feeling (e.g. Sleep — you can't rate how you felt while asleep).
  skipFeeling?: boolean;
}

interface TaxonomyConfig {
  version: 1;
  activities: ActivityDef[];
  updatedAt: number; // logical clock (epoch ms) for last-write-wins with the server
}

export const DEFAULT_ACTIVITIES: ActivityDef[] = [
  { index: 0, name: "Sleep", color: "#273036", icon: "bed", skipFeeling: true },
  { index: 1, name: "Dating", color: "#C61533", icon: "favorite" },
  { index: 2, name: "Friends", color: "#005744", icon: "person" },
  { index: 3, name: "Work", color: "#1B5E20", icon: "work" },
  { index: 4, name: "Health", color: "#01A9B3", icon: "fitness-center" },
  { index: 5, name: "Art", color: "#199748", icon: "brush" },
  { index: 6, name: "Productive", color: "#FFF335", icon: "precision-manufacturing" },
  { index: 7, name: "Hobbies", color: "#FF6D01", icon: "sports-esports" },
  { index: 8, name: "Leisure", color: "#5B3AB0", icon: "tv" },
  { index: 9, name: "Waste", color: "#FF2917", icon: "delete" },
  { index: 10, name: "Transition", color: "#BFFF56", icon: "transit-enterexit" },
];

// Palette + icon set offered in the activities editor.
export const COLOR_CHOICES = [
  "#273036", "#C61533", "#005744", "#1B5E20", "#01A9B3", "#199748",
  "#FFF335", "#FF6D01", "#5B3AB0", "#FF2917", "#BFFF56", "#1A73E8",
  "#9C27B0", "#795548", "#607D8B", "#E91E63",
];

export const ICON_CHOICES: IconName[] = [
  "bed", "favorite", "person", "work", "fitness-center", "brush",
  "precision-manufacturing", "sports-esports", "tv", "delete", "transit-enterexit",
  "school", "build", "restaurant", "directions-car", "flight", "pets",
  "music-note", "menu-book", "shopping-cart", "self-improvement", "computer",
];

export const feelings = ["Terrible", "Poor", "Ok", "Neutral", "Good", "Great"];

// Red -> green ramp, one entry per feeling index. Used for charts and tints.
export const feelingColors = [
  "#E53935", "#FB8C00", "#FDD835", "#C0CA33", "#7CB342", "#43A047",
];

export const feelingIcons = [
  ({ color }: { color: string }) => <VerySadIcon color={color} />,
  ({ color }: { color: string }) => <Icon color={color} name="sentiment-very-dissatisfied" />,
  ({ color }: { color: string }) => <Icon color={color} name="sentiment-dissatisfied" />,
  ({ color }: { color: string }) => <Icon color={color} name="sentiment-neutral" />,
  ({ color }: { color: string }) => <Icon color={color} name="sentiment-satisfied" />,
  ({ color }: { color: string }) => <Icon color={color} name="sentiment-satisfied-alt" />,
];

// #region store
const STORE_KEY = "rn_taxonomy";

// Defaults carry updatedAt 0 so any real (pulled or user-edited) config wins LWW
// and the untouched defaults are never pushed as authoritative.
let config: TaxonomyConfig = { version: 1, activities: sortByIndex(DEFAULT_ACTIVITIES), updatedAt: 0 };
let dirty = false;
let loaded = false;

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
export function subscribeTaxonomy(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function sortByIndex(list: ActivityDef[]): ActivityDef[] {
  return [...list].sort((a, b) => a.index - b.index);
}

async function persist() {
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(config));
}

export async function loadTaxonomy(): Promise<void> {
  if (loaded) return;
  const raw = await AsyncStorage.getItem(STORE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw) as TaxonomyConfig;
    config = { version: 1, activities: sortByIndex(parsed.activities ?? DEFAULT_ACTIVITIES), updatedAt: parsed.updatedAt ?? 0 };
  }
  loaded = true;
  emit();
}

/** Clear on logout (don't leave one account's categories for the next). */
export async function clearTaxonomy(): Promise<void> {
  config = { version: 1, activities: sortByIndex(DEFAULT_ACTIVITIES), updatedAt: 0 };
  dirty = false;
  loaded = false;
  await AsyncStorage.removeItem(STORE_KEY);
  emit();
}

export function getActivities(): ActivityDef[] {
  return config.activities;
}

export function getActivity(index: number): ActivityDef | undefined {
  return config.activities.find((a) => a.index === index);
}

export function activityColor(index: number): string {
  return getActivity(index)?.color ?? "#9e9e9e";
}

export function activityName(index: number): string {
  return getActivity(index)?.name ?? `Unknown #${index}`;
}

function mutate(next: ActivityDef[]) {
  config = { version: 1, activities: sortByIndex(next), updatedAt: Date.now() };
  dirty = true;
  emit();
  void persist();
}

/** Add a new activity or replace the one at `def.index`. */
export function upsertActivity(def: ActivityDef) {
  const rest = config.activities.filter((a) => a.index !== def.index);
  mutate([...rest, def]);
}

export function removeActivity(index: number) {
  mutate(config.activities.filter((a) => a.index !== index));
}

/** Replace the whole set (used by the editor's reorder/bulk ops and by import). */
export function setActivities(list: ActivityDef[]) {
  mutate(list);
}

/** Lowest unused non-negative index (for the editor's "add" button). */
export function nextFreeIndex(): number {
  const used = new Set(config.activities.map((a) => a.index));
  let i = 0;
  while (used.has(i)) i++;
  return i;
}
// #endregion

// #region sync glue (called by entries.ts)
export function taxonomyDirty(): boolean {
  return dirty;
}

export interface ConfigRecord {
  cellId: string;
  ciphertext: string;
  nonce: string;
  deleted: boolean;
  updatedAt: number;
}

/** The sealed config cell to push (call only when taxonomyDirty()). */
export function taxonomySealedRecord(dek: Uint8Array): ConfigRecord {
  const sealed = sealJson(dek, config);
  return { cellId: configCellId(dek), ciphertext: sealed.ciphertext, nonce: sealed.nonce, deleted: false, updatedAt: config.updatedAt };
}

export function markTaxonomyClean() {
  dirty = false;
}

/** Merge a pulled config cell (LWW by updatedAt). Returns true if local changed. */
export function applyPulledConfig(dek: Uint8Array, record: { ciphertext: string; nonce: string; updatedAt: number }): boolean {
  if (record.updatedAt <= config.updatedAt) return false;
  const pulled = openJson<TaxonomyConfig>(dek, { ciphertext: record.ciphertext, nonce: record.nonce });
  config = { version: 1, activities: sortByIndex(pulled.activities ?? []), updatedAt: record.updatedAt };
  void persist();
  emit();
  return true;
}
// #endregion

/** Reactive list of activities (sorted by index); re-renders on edits/sync. */
export function useActivities(): ActivityDef[] {
  const [list, setList] = useState<ActivityDef[]>(getActivities);
  useEffect(() => {
    void loadTaxonomy();
    return subscribeTaxonomy(() => setList(getActivities()));
  }, []);
  return list;
}

/** Return black or white for legible text on the given background color. */
export function getContrastingTextColor(hexColor: string): string {
  hexColor = hexColor.replace(/^#/, "");
  const r = parseInt(hexColor.substr(0, 2), 16);
  const g = parseInt(hexColor.substr(2, 2), 16);
  const b = parseInt(hexColor.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}

/** Lighten a hex color by a percentage (used for the selected-activity state). */
export function lightenColor(hexColor: string, percent: number): string {
  hexColor = hexColor.replace(/^#/, "");
  let r = parseInt(hexColor.substr(0, 2), 16);
  let g = parseInt(hexColor.substr(2, 2), 16);
  let b = parseInt(hexColor.substr(4, 2), 16);
  r = Math.min(255, Math.floor(r * (1 + percent / 100)));
  g = Math.min(255, Math.floor(g * (1 + percent / 100)));
  b = Math.min(255, Math.floor(b * (1 + percent / 100)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
