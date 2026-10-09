/**
 * THE SEAM.
 *
 * Every read of event data in this app goes through this module. No component,
 * route, or hook may import `events.ts` directly. Swapping the local array for
 * a CMS, an API, or a build-time JSON file means replacing the body of
 * `loadRecords()` and nothing else.
 */

import type { EventEntry, EventRecord, EventStatus } from "../types/event";
import { events as seedRecords, sourceMeta as seedSourceMeta } from "./events";

/** The only place that knows where records come from. */
async function loadRecords(): Promise<EventRecord[]> {
  return seedRecords;
}

/**
 * Status is derived, never stored. An event with no printed start time counts
 * as upcoming through the end of its calendar day, so a show does not fall into
 * the past at midnight of the morning it happens.
 */
export function deriveStatus(date: string, now: Date = new Date()): EventStatus {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const parsed = new Date(isDateOnly ? `${date}T23:59:59` : date);
  if (Number.isNaN(parsed.getTime())) return "past";
  return parsed.getTime() >= now.getTime() ? "upcoming" : "past";
}

function byDateDescending(a: EventEntry, b: EventEntry): number {
  return b.date.localeCompare(a.date);
}

/** Reverse-chronological, with status derived at read time. */
export async function getEvents(now: Date = new Date()): Promise<EventEntry[]> {
  const records = await loadRecords();
  return records
    .map((record) => ({ ...record, status: deriveStatus(record.endDate ?? record.date, now) }))
    .sort(byDateDescending);
}

export async function getEventById(
  eventId: string,
  now: Date = new Date(),
): Promise<EventEntry | undefined> {
  const all = await getEvents(now);
  return all.find((entry) => entry.eventId === eventId);
}

/** Upcoming first and ascending (soonest next), which is how a bill reads. */
export async function getUpcoming(now: Date = new Date()): Promise<EventEntry[]> {
  const all = await getEvents(now);
  return all
    .filter((entry) => entry.status === "upcoming")
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getPast(now: Date = new Date()): Promise<EventEntry[]> {
  const all = await getEvents(now);
  return all.filter((entry) => entry.status === "past");
}

/** Every asset across every event, newest event first. Feeds ARCHIVE. */
export async function getAllAssets(now: Date = new Date()) {
  const all = await getEvents(now);
  return all.flatMap((entry) =>
    entry.assets.map((asset) => ({ ...asset, event: entry })),
  );
}

export async function getSourceMeta() {
  return seedSourceMeta;
}
