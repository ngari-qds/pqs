"use client";
/**
 * Photo state for the studio: moods detected from the quote, an optional
 * keyword override, provider search, calm-area ranking, loading with
 * resolution verification, and "new image" shuffling.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { detectMoods, queryFor, type Mood } from "@/lib/images/keywords";
import { loadPhoto, PhotoTooSmallError, rankByCalm, searchPhotos, type LoadedPhoto } from "@/lib/images/client";
import { coversTarget, type Size } from "@/lib/images/resolution";
import type { PhotoCandidate, SearchResponse } from "@/lib/images/types";
import type { LayoutId } from "@/lib/render/template";

export type PhotoStatus = "idle" | "searching" | "loading" | "ready" | "offline" | "empty" | "error";

interface Options {
  enabled: boolean;
  text: string;
  layout: LayoutId;
  /** Export pixel size: photos must cover it. */
  target: Size;
}

export function usePhoto({ enabled, text, layout, target }: Options) {
  const [moods, setMoodsState] = useState<Mood[]>(() => detectMoods(text));
  const [moodsTouched, setMoodsTouched] = useState(false);
  const [override, setOverride] = useState("");
  const [step, setStep] = useState(0); // which search term
  const [page, setPage] = useState(1);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [candidates, setCandidates] = useState<PhotoCandidate[]>([]);
  const [index, setIndex] = useState(0);
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [status, setStatus] = useState<PhotoStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Follow the quote's moods (debounced) until the user picks moods by hand.
  useEffect(() => {
    if (moodsTouched) return;
    const t = setTimeout(() => {
      const next = detectMoods(text);
      setMoodsState((cur) => (cur.join() === next.join() ? cur : next));
    }, 700);
    return () => clearTimeout(t);
  }, [text, moodsTouched]);

  const query = queryFor(moods, override, step);
  const tw = target.width, th = target.height;

  // Search whenever the query, page or export size changes.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setStatus("searching");
    setMessage(null);
    (async () => {
      try {
        const res = await searchPhotos(query, { width: tw, height: th }, page);
        if (cancelled) return;
        setResponse(res);
        if (res.offline) {
          setStatus("offline");
          setCandidates([]);
          setPhoto(null);
          return;
        }
        if (!res.candidates.length) {
          setStatus("empty");
          setCandidates([]);
          return;
        }
        const ranked = await rankByCalm(res.candidates, layoutRef.current, tw / th);
        if (cancelled) return;
        setCandidates(ranked);
        setIndex(0);
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setMessage((e as Error).message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, query, page, tw, th]);

  // Load the current candidate; skip any that turn out too small once decoded.
  useEffect(() => {
    if (!enabled || !candidates.length) return;
    const c = candidates[index];
    if (!c) return;
    if (photo?.candidate.key === c.key && coversTarget(photo.verifiedFor, { width: tw, height: th })) {
      setStatus("ready");
      return;
    }
    const ac = new AbortController();
    setStatus("loading");
    loadPhoto(c, { width: tw, height: th }, ac.signal)
      .then((p) => {
        setPhoto((old) => {
          if (old && old.bitmap !== p.bitmap) old.bitmap.close();
          return p;
        });
        setStatus("ready");
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        if (e instanceof PhotoTooSmallError && index + 1 < candidates.length) setIndex(index + 1);
        else {
          setStatus("error");
          setMessage((e as Error).message);
        }
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, candidates, index, tw, th]);

  /** Next photo: same results first, then the next search term (or page). */
  const next = useCallback(() => {
    if (index + 1 < candidates.length) setIndex(index + 1);
    else if (override.trim()) setPage((p) => p + 1);
    else setStep((s) => s + 1);
  }, [index, candidates.length, override]);

  const setMoods = useCallback((m: Mood[]) => {
    setMoodsTouched(true);
    setMoodsState(m);
    setStep(0);
    setPage(1);
  }, []);

  const resetMoods = useCallback(() => {
    setMoodsTouched(false);
    setMoodsState(detectMoods(text));
    setStep(0);
    setPage(1);
  }, [text]);

  const setKeyword = useCallback((k: string) => {
    setOverride(k);
    setPage(1);
  }, []);

  /** For export: make sure the current photo is verified for `size` (reloads if needed). */
  const ensureFor = useCallback(
    async (size: Size): Promise<LoadedPhoto | null> => {
      if (!photo) return null;
      if (coversTarget(photo.verifiedFor, size)) return photo;
      const p = await loadPhoto(photo.candidate, size);
      setPhoto((old) => {
        if (old && old.bitmap !== p.bitmap) old.bitmap.close();
        return p;
      });
      return p;
    },
    [photo],
  );

  return {
    status: enabled ? status : "idle",
    message,
    photo: enabled && photo ? photo : null,
    candidate: candidates[index] ?? null,
    candidates,
    index,
    response,
    moods,
    moodsTouched,
    setMoods,
    resetMoods,
    keyword: override,
    setKeyword,
    query,
    next,
    ensureFor,
  };
}
