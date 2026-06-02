import { useEffect, useState } from "react";

/** A single hour formatted per the 12/24h setting, e.g. "15:00" or "3 PM". */
export function formatHourClock(hour: number, hour24: boolean): string {
  const h = ((hour % 24) + 24) % 24;
  if (hour24) return `${h.toString().padStart(2, "0")}:00`;
  return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
}

/** An hour's full range label, e.g. "15:00 – 16:00" or "3 PM – 4 PM". */
export function hourRangeLabel(hour: number, hour24: boolean): string {
  return `${formatHourClock(hour, hour24)} – ${formatHourClock(hour + 1, hour24)}`;
}

export function useDate(sync: "hourly") {
  const [date, setDate] = useState(new Date());
  useEffect(() => {
    const target = new Date();

    if (sync === "hourly") {
      target.setMinutes(0);
      target.setSeconds(0);
      target.setMilliseconds(0);
      target.setHours(target.getHours() + 1);
    } else {
      throw new Error("Invalid sync value");
    }

    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      setDate(new Date());
      timer = null;
    }, target.getTime() - new Date().getTime() + 10);

    return () => {
      timer !== null && clearTimeout(timer);
    };
  }, []);
  return date;
}
