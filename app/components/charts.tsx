// Lightweight charts hand-rolled on react-native-svg (already a dep), so they
// render identically on native and the web export with no extra charting lib.
import React from "react";
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
}

/**
 * A smoothed-value line chart. Points are spaced evenly by index (the series is
 * already chronological + evenly gridded). Draws min/mid/max gridlines with
 * labels and an optional shaded area under the line.
 */
export function LineChart({
  points, min, max, width, height = 180, color = "#1a73e8", fill = "rgba(26,115,232,0.12)",
  yLabel = (v: number) => v.toFixed(1),
}: {
  points: LinePoint[];
  min: number;
  max: number;
  width: number;
  height?: number;
  color?: string;
  fill?: string;
  yLabel?: (v: number) => string;
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
  const grid = [max, (max + min) / 2, min];

  return (
    <Svg width={width} height={height}>
      {grid.map((g, i) => (
        <G key={i}>
          <Line x1={padL} y1={y(g)} x2={width - padR} y2={y(g)} stroke="#eceff1" strokeWidth={1} />
          <SvgText x={0} y={y(g) + 3} fontSize={9} fill="#9aa0a6">{yLabel(g)}</SvgText>
        </G>
      ))}
      {n > 0 && <Path d={area} fill={fill} stroke="none" />}
      {n > 0 && <Path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />}
    </Svg>
  );
}
// #endregion

// #region bar
/** A single horizontal proportional bar (used for avg-mood-per-activity rows). */
export function HBar({ fraction, color, width, height = 10 }: { fraction: number; color: string; width: number; height?: number }) {
  const w = Math.max(0, Math.min(1, fraction)) * width;
  return (
    <Svg width={width} height={height}>
      <Rect x={0} y={0} width={width} height={height} rx={height / 2} fill="#eceff1" />
      {w > 0 && <Rect x={0} y={0} width={w} height={height} rx={height / 2} fill={color} />}
    </Svg>
  );
}
// #endregion
