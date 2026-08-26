// Lightweight charts hand-rolled on react-native-svg (already a dep), so they
// render identically on native and the web export with no extra charting lib.
import React from "react";
import { PanResponder, StyleSheet, Text as RNText, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";

// #region donut
export interface DonutSlice {
  value: number;
  color: string;
}

/** A donut/ring chart. Slices are drawn as dashed strokes around one circle. */
export function DonutChart({
  slices, size = 160, strokeWidth = 26, track = "#eceff1",
}: {
  slices: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  track?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  return (
    <Svg width={size} height={size}>
      {/* start at 12 o'clock */}
      <G rotation={-90} origin={`${cx}, ${cx}`}>
        <Circle cx={cx} cy={cx} r={r} stroke={track} strokeWidth={strokeWidth} fill="none" />
        {slices.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * c;
          const el = (
            <Circle
              key={i}
              cx={cx}
              cy={cx}
              r={r}
              stroke={s.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-acc * c}
            />
          );
          acc += frac;
          return el;
        })}
      </G>
    </Svg>
  );
}
// #endregion

// #region line
export interface LinePoint {
  value: number;
  t?: number; // epoch ms, used only to label the scrub tooltip
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A smoothed-value line chart. Points are spaced evenly by index (the series is
 * already chronological + evenly gridded). Draws min/mid/max gridlines with labels
 * and an optional shaded area. When points carry `t`, dragging (or pressing) across
 * the chart shows a vertical marker plus a tooltip with the date and value at your
 * finger.
 */
export function LineChart({
  points, min, max, width, height = 180, color = "#1a73e8", fill = "rgba(26,115,232,0.12)",
  grid = "#eceff1", axis = "#9aa0a6", yLabel = (v: number) => v.toFixed(1),
  granularity = "day", tooltipBg = "#1E1E1E", tooltipColor = "#ffffff", tooltipSub = "#aaaaaa",
  valueLabel = (v: number) => v.toFixed(1),
}: {
  points: LinePoint[];
  min: number;
  max: number;
  width: number;
  height?: number;
  color?: string;
  fill?: string;
  grid?: string;
  axis?: string;
  yLabel?: (v: number) => string;
  granularity?: "hour" | "day";
  tooltipBg?: string;
  tooltipColor?: string;
  tooltipSub?: string;
  valueLabel?: (v: number) => string;
}) {
  const padL = 28, padR = 8, padT = 8, padB = 8;
  const plotW = Math.max(1, width - padL - padR);
  const plotH = height - padT - padB;
  const span = max - min || 1;
  const n = points.length;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + (1 - (v - min) / span) * plotH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = n > 0
    ? `${line} L${x(n - 1).toFixed(1)},${(padT + plotH).toFixed(1)} L${x(0).toFixed(1)},${(padT + plotH).toFixed(1)} Z`
    : "";
  const gridLines = [max, (max + min) / 2, min];

  const [active, setActive] = React.useState<number | null>(null);
  // Pan handlers are created once; they read geometry from this ref so they never
  // use stale values after points/width change.
  const geo = React.useRef({ n, padL, plotW });
  geo.current = { n, padL, plotW };
  const pick = (locX: number): number | null => {
    const g = geo.current;
    if (g.n === 0) return null;
    if (g.n === 1) return 0;
    return Math.max(0, Math.min(g.n - 1, Math.round(((locX - g.padL) / g.plotW) * (g.n - 1))));
  };
  const pan = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setActive(pick(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => setActive(pick(e.nativeEvent.locationX)),
      onPanResponderRelease: () => setActive(null),
      onPanResponderTerminate: () => setActive(null),
    }),
  ).current;

  const ai = active != null && points[active] ? active : null;
  const ap = ai != null ? points[ai] : null;
  const fmtDate = (t?: number): string => {
    if (t == null) return "";
    const d = new Date(t);
    const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    return granularity === "hour" ? `${base}, ${d.getHours()}:00` : base;
  };
  const TIP_W = 108;
  const tipLeft = ai != null ? Math.max(0, Math.min(width - TIP_W, x(ai) - TIP_W / 2)) : 0;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {gridLines.map((g, i) => (
          <G key={i}>
            <Line x1={padL} y1={y(g)} x2={width - padR} y2={y(g)} stroke={grid} strokeWidth={1} />
            <SvgText x={0} y={y(g) + 3} fontSize={9} fill={axis}>{yLabel(g)}</SvgText>
          </G>
        ))}
        {n > 0 && <Path d={area} fill={fill} stroke="none" />}
        {n > 0 && <Path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />}
        {ap && (
          <G>
            <Line x1={x(ai as number)} y1={padT} x2={x(ai as number)} y2={padT + plotH} stroke={color} strokeWidth={1} opacity={0.5} />
            <Circle cx={x(ai as number)} cy={y(ap.value)} r={4} fill={color} stroke={tooltipBg} strokeWidth={1.5} />
          </G>
        )}
      </Svg>
      {ap && (
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: 2, left: tipLeft, width: TIP_W, backgroundColor: tooltipBg, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8 }}
        >
          <RNText style={{ color: tooltipSub, fontSize: 10, fontWeight: "600" }}>{fmtDate(ap.t)}</RNText>
          <RNText style={{ color: tooltipColor, fontSize: 14, fontWeight: "700" }}>{valueLabel(ap.value)}</RNText>
        </View>
      )}
      <View {...pan.panHandlers} style={StyleSheet.absoluteFill} />
    </View>
  );
}
// #endregion

// #region bar
/** A single horizontal proportional bar (used for avg-mood-per-activity rows). */
export function HBar({ fraction, color, width, height = 10, track = "#eceff1" }: { fraction: number; color: string; width: number; height?: number; track?: string }) {
  const w = Math.max(0, Math.min(1, fraction)) * width;
  return (
    <Svg width={width} height={height}>
      <Rect x={0} y={0} width={width} height={height} rx={height / 2} fill={track} />
      {w > 0 && <Rect x={0} y={0} width={w} height={height} rx={height / 2} fill={color} />}
    </Svg>
  );
}
// #endregion
