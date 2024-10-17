import { useEffect, useState } from "react";

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

    let timer: any | null = setTimeout(() => {
      setDate(new Date());
      timer = null;
    }, target.getTime() - new Date().getTime() + 10);

    return () => {
      timer !== null && clearTimeout(timer);
    };
  }, []);
  return date;
}
