import { Poster } from "./Poster";
import { SIZES } from "../lib/assets";
import { formatDate, igUrl } from "../lib/format";
import type { EventEntry } from "../types/event";
import "./EventEntryCard.css";

/**
 * One night.
 *
 * Deliberately minimal (Nico, 2026-09-22): venue, address, date, lineup, as
 * plain lines with NO field labels. The labels (WHERE / WHEN / WHO) were cut
 * because each line already announces what it is: a place reads as a place, a
 * date as a date, a row of handles as a lineup. Naming them doubled the text for
 * no added meaning. Time of night and coordinates were cut from the default view
 * for the same reason. The flyer is the content; this is the index to it.
 *
 * `location` renders as the street address, the coordinates, or both, so the
 * abstract-coordinate treatment can be judged against the literal one.
 */


/**
 * The street address line, or nothing at all.
 *
 * A missing address renders NOTHING rather than "N/A" (Nico, 2026-09-22). Ten of
 * the flyers never printed a street, and a column of N/A said only that the
 * archive has holes, which is not information a reader wants. The entry still
 * carries venue, date and lineup, which is the useful part. The gaps are tracked
 * in vision-worksheet.md so they stay visible to us rather than to visitors.
 *
 * `venue.coords` still exists on every event and is still geocoded by
 * scripts/geocode_venues.py. It is deliberately not rendered: the coordinate
 * treatment was built, compared side by side against the address, and cut.
 * Switching to it later is a one-line change here, not a re-harvest.
 */
function Location({ entry }: { entry: EventEntry }) {
  const { venue } = entry;
  if (!venue.address) return null;
  return <span>{venue.address}{venue.city ? `, ${venue.city}` : ""}</span>;
}

export function EventEntryCard({ entry, index }: { entry: EventEntry; index: number }) {
  const flyer = entry.assets.find((a) => a.role === "flyer") ?? entry.assets[0];
  const upcoming = entry.status === "upcoming";
  const alt = `Flyer: ${entry.venue.name}, ${formatDate(entry.date)}`;

  return (
    <article className={`event${upcoming ? " event--upcoming" : ""}`}>
      <div className="event__media">
        {flyer && (
          <Poster
            assetId={flyer.assetId}
            aspectRatio={flyer.aspectRatio}
            alt={alt}
            sizes={SIZES.feature}
            priority={index < 2}
            className="poster--feature"
          />
        )}
      </div>

      <div className="event__body">
        <div className="event__facts">
          <p className="event__where">
            {entry.venue.name && <span className="event__venue">{entry.venue.name}</span>}
            <Location entry={entry} />
          </p>

          <p className="event__when">
            <time dateTime={entry.date}>{formatDate(entry.date)}</time>
          </p>

          {entry.djs.length > 0 && (
            <p className="event__djs">
              {entry.djs.map((dj) => (
                <span key={dj.name} className="event__dj">
                  {dj.instagram ? (
                    <a href={igUrl(dj.instagram)} target="_blank" rel="noreferrer noopener">
                      {dj.name}
                    </a>
                  ) : (
                    dj.name
                  )}
                </span>
              ))}
            </p>
          )}

          {entry.presentedBy && entry.presentedBy.length > 0 && (
            <p className="event__djs event__presented">
              {entry.presentedBy.map((p) => (
                <span key={p.name} className="event__dj">
                  {p.instagram ? (
                    <a href={igUrl(p.instagram)} target="_blank" rel="noreferrer noopener">{p.name}</a>
                  ) : (
                    p.name
                  )}
                </span>
              ))}
            </p>
          )}
        </div>

        {upcoming && (entry.links?.tickets || entry.links?.email || entry.links?.sms) && (
          <div className="event__actions">
            {entry.links?.tickets && (
              <a className="btn btn--primary" href={entry.links.tickets} target="_blank" rel="noreferrer noopener">Tickets</a>
            )}
            {entry.links?.email && <a className="btn" href={entry.links.email}>Email</a>}
            {entry.links?.sms && <a className="btn" href={entry.links.sms}>Text the list</a>}
          </div>
        )}
      </div>
    </article>
  );
}
