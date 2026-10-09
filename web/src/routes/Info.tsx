import { Link } from "react-router-dom";
import "./Info.css";
import { info } from "../data/info";

/**
 * INFO: bio, crew, contact.
 *
 * Rendered from src/data/info.ts (transcribed from CONTENT.md). A null field
 * renders nothing rather than a placeholder, so an undecided channel never ships
 * as a dead button.
 */

const ig = (handle: string) => `https://instagram.com/${handle}`;

export default function Info() {
  const { contact } = info;
  const emails: [string, string][] = [];
  if (contact.general) emails.push(["General", contact.general]);
  if (contact.booking) emails.push(["Booking", contact.booking]);
  if (contact.press) emails.push(["Press", contact.press]);

  return (
    <div className="page">
      <h1 className="u-visually-hidden">Info</h1>

      {import.meta.env.DEV && !info.bioApproved && (
        <p className="seed-notice">Draft bio, awaiting approval. Source: CONTENT.md.</p>
      )}

      <div className="info" data-nav-home>
        <section className="info__block">
          <h2 className="u-label">About</h2>
          {info.bio.map((p) => (
            <p key={p} className="info__bio">{p}</p>
          ))}
          <dl className="info__list">
            <dt>Based</dt>
            <dd>{info.cities.join(", ")}</dd>
          </dl>
        </section>

        <section className="info__block">
          <h2 className="u-label">Crew</h2>
          <dl className="info__list">
            {info.members.map((m) => (
              <div key={m.instagram} className="info__row">
                <dt>
                  <a href={ig(m.instagram)} target="_blank" rel="noreferrer noopener">{m.name}</a>
                </dt>
                <dd>{m.roles}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="info__block">
          <h2 className="u-label">Contact</h2>
          <dl className="info__list">
            {emails.map(([label, address]) => (
              <div key={label} className="info__row">
                <dt>{label}</dt>
                <dd><a href={`mailto:${address}`}>{address}</a></dd>
              </div>
            ))}
            <div className="info__row">
              <dt>Instagram</dt>
              <dd>
                <a href={ig(contact.instagram)} target="_blank" rel="noreferrer noopener">@{contact.instagram}</a>
              </dd>
            </div>
          </dl>
          {info.submissions && <p className="info__bio">{info.submissions}</p>}
          <p className="info__bio"><Link to="/cv">Booking CV</Link></p>
        </section>

        {info.mailingList && (
          <section className="info__block">
            <h2 className="u-label">The list</h2>
            <form className="info__form" action={info.mailingList.endpoint} method="post">
              <label className="u-label" htmlFor="email">Email</label>
              <input id="email" type="email" name="email" placeholder="you@example.com" required />
              <button className="btn" type="submit">Join</button>
            </form>
          </section>
        )}
      </div>
    </div>
  );
}
