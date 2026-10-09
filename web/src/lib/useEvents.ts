import { useEffect, useState } from "react";
import { getEvents } from "../data/getEvents";
import type { EventEntry } from "../types/event";

/** The only hook that reads event data, and it reads it through the seam. */
export function useEvents() {
  const [events, setEvents] = useState<EventEntry[] | null>(null);
  useEffect(() => {
    let alive = true;
    getEvents().then((e) => alive && setEvents(e));
    return () => { alive = false; };
  }, []);
  return events;
}
