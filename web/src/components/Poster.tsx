/**
 * A poster, and the site's signature moment.
 *
 * MOTION-INVENTORY.md replaces the reference's light-smear transition with
 * something native to this material: a poster DEVELOPS, like a print in a tray.
 * It enters as its ThumbHash (blurred, color-accurate, flat), and resolves to
 * the full image with a contrast and saturation ramp.
 *
 * The point worth preserving if this is ever rewritten: the development and the
 * blur-up placeholder are THE SAME MECHANISM. ThumbHash exists here for
 * performance (zero layout shift, instant perceived paint). Staging it rather
 * than hiding it buys the site its identity for zero additional bytes. Do not
 * split them into two systems.
 *
 * Layout rule: aspectRatio is declared from stored metadata BEFORE any image
 * loads, so the box never resizes. That is what keeps CLS at zero across 59
 * tiles.
 */

import { useEffect, useRef, useState } from "react";
import { thumbHashToDataURL } from "thumbhash";
import {
  loadDerivatives,
  srcSetFor,
  fallbackSrc,
  type DerivativeEntry,
} from "../lib/assets";
import "./Poster.css";

interface PosterProps {
  assetId: string;
  /** When present the artifact moves, and plays in place of the still. The still
   *  stays underneath as the poster frame and as the fallback if it cannot
   *  play. */
  motion?: { src: string; type: string };
  /** From the event data. Used until derivatives.json loads, and if it never does. */
  aspectRatio: number;
  alt: string;
  sizes: string;
  /** Above-the-fold posters skip lazy loading and decode eagerly. */
  priority?: boolean;
  className?: string;
}

function thumbDataUrl(hash: string | undefined): string | undefined {
  if (!hash) return undefined;
  try {
    return thumbHashToDataURL(Uint8Array.from(atob(hash), (c) => c.charCodeAt(0)));
  } catch {
    return undefined; // a malformed hash degrades to a flat field, never a crash
  }
}

export function Poster({ assetId, motion, aspectRatio, alt, sizes, priority = false, className }: PosterProps) {
  const [entry, setEntry] = useState<DerivativeEntry | undefined>();
  // Whether the derivative manifest has come back yet. Without this, every
  // poster renders its "awaiting harvest" box for the first frames of every
  // page load, claiming assets are missing when they are merely unfetched.
  const [resolved, setResolved] = useState(false);
  const [developed, setDeveloped] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  // A browser may refuse to play even a muted, inline video: iOS in Low Power
  // Mode or Data Saver does, and then draws its own play button over the
  // flyer. When playback is refused the video is removed and the still (which
  // is already its poster frame) is simply the artifact.
  const videoRef = useRef<HTMLVideoElement>(null);
  const [motionBlocked, setMotionBlocked] = useState(false);

  useEffect(() => {
    let alive = true;
    loadDerivatives().then((all) => {
      if (!alive) return;
      setEntry(all[assetId]);
      setResolved(true);
    });
    return () => {
      alive = false;
    };
  }, [assetId]);

  /**
   * Develop only once the bytes are actually decoded. Cross-dissolving while the
   * browser is still decoding is what makes this pattern jank on a long grid.
   */
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !entry) return;
    let alive = true;
    const finish = () => alive && setDeveloped(true);
    if (img.complete && img.naturalWidth > 0) {
      (img.decode?.() ?? Promise.resolve()).then(finish).catch(finish);
    } else {
      img.addEventListener("load", finish, { once: true });
      img.addEventListener("error", finish, { once: true });
    }
    return () => {
      alive = false;
    };
  }, [entry]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let alive = true;
    const tryPlay = () => {
      video.play()?.catch((err: DOMException) => {
        // AbortError only means a newer load interrupted this one; not a refusal.
        if (alive && err?.name === "NotAllowedError") setMotionBlocked(true);
      });
    };
    tryPlay();
    // Browsers pause video in a hidden page (another app, another tab) and do
    // not always resume it, which leaves a frozen frame. Ask again on return.
    const onVisible = () => {
      if (document.visibilityState === "visible" && video.paused) tryPlay();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [entry, motion?.src]);

  const ratio = entry?.aspectRatio ?? aspectRatio;
  const placeholder = thumbDataUrl(entry?.thumbHash);
  const src = fallbackSrc(entry);

  return (
    <figure
      className={`poster${developed ? " is-developed" : ""}${className ? ` ${className}` : ""}`}
      style={{ aspectRatio: String(ratio) }}
      data-asset={assetId}
    >
      {placeholder && (
        <img className="poster__placeholder" src={placeholder} alt="" aria-hidden="true" />
      )}

      {/* A moving artifact plays over its own still. Muted and playsInline so it
          autoplays on iOS, looped because these are a few seconds of flyer
          animation, and preload="none" so a grid of them costs nothing until
          they are on screen. The still remains the poster frame, so a browser
          that will not play it shows exactly what it showed before. */}
      {src && motion && !motionBlocked && (
        <video
          ref={videoRef}
          className="poster__motion"
          src={motion.src}
          poster={src}
          muted
          loop
          playsInline
          autoPlay
          preload="none"
          aria-hidden="true"
        />
      )}

      {src ? (
        <>
          <picture>
            <source type="image/avif" srcSet={srcSetFor(entry, "avif")} sizes={sizes} />
            <source type="image/webp" srcSet={srcSetFor(entry, "webp")} sizes={sizes} />
            <img
              ref={imgRef}
              className="poster__img"
              src={src}
              srcSet={srcSetFor(entry, "jpg")}
              sizes={sizes}
              alt={alt}
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={priority ? "high" : "auto"}
            />
          </picture>

        </>
      ) : resolved ? (
        /* Resolved AND absent: this asset genuinely has no derivatives, so say
           so rather than rendering a broken image icon. */
        <div className="poster__absent" role="img" aria-label={alt}>
          <span className="u-mono">{assetId}</span>
          <span className="u-mono">awaiting harvest</span>
        </div>
      ) : null}
    </figure>
  );
}
