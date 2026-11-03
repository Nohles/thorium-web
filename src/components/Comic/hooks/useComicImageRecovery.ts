import { useCallback, useEffect, useRef, useState } from "react";
import {
  COMIC_IMAGE_RETRY_ACTION_DELAY_MS,
  getComicImageAutoRetryDelay,
} from "../lib/comicImageRecovery";
import { recordComicImageRetry } from "../lib/comicReaderTelemetry";

/**
 * Keeps a comic page trying to load: retries `<img>` errors with backoff, offers
 * "Try again" once a load has taken a while, and retries a failed page when the
 * connection returns or the page scrolls back into view.
 */
export const useComicImageRecovery = ({
  href,
  isPending,
  hasLoadError,
  isInView,
  onReload,
}: {
  href: string;
  /** The page should be showing but its image is not ready yet. */
  isPending: boolean;
  /** A failure reported outside the `<img>`, such as a publication read. */
  hasLoadError: boolean;
  isInView: boolean;
  onReload: () => void;
}) => {
  const [hasImageError, setHasImageError] = useState(false);
  const [showRetryAction, setShowRetryAction] = useState(false);
  const [manualRetryCount, setManualRetryCount] = useState(0);
  const autoRetriesRef = useRef(0);
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onReloadRef = useRef(onReload);
  const hasFailed = hasLoadError || hasImageError;

  useEffect(() => {
    onReloadRef.current = onReload;
  }, [onReload]);

  const cancelAutoRetry = useCallback(() => {
    if (autoRetryTimerRef.current === null) return;
    clearTimeout(autoRetryTimerRef.current);
    autoRetryTimerRef.current = null;
  }, []);

  const reload = useCallback(() => {
    cancelAutoRetry();
    setHasImageError(false);
    onReloadRef.current();
  }, [cancelAutoRetry]);

  /** Starts over with a full set of automatic retries. */
  const retry = useCallback(() => {
    autoRetriesRef.current = 0;
    setShowRetryAction(false);
    setManualRetryCount((count) => count + 1);
    reload();
  }, [reload]);

  const reportImageError = useCallback(() => {
    if (autoRetryTimerRef.current !== null) return;
    const delay = getComicImageAutoRetryDelay(autoRetriesRef.current);
    if (delay === undefined) {
      setHasImageError(true);
      return;
    }
    autoRetriesRef.current += 1;
    recordComicImageRetry(href, `image retry ${autoRetriesRef.current}`);
    autoRetryTimerRef.current = setTimeout(() => {
      autoRetryTimerRef.current = null;
      reload();
    }, delay);
  }, [href, reload]);

  useEffect(() => cancelAutoRetry, [cancelAutoRetry]);

  // A different page, or one that no longer needs loading, starts from scratch.
  useEffect(() => {
    cancelAutoRetry();
    autoRetriesRef.current = 0;
    setHasImageError(false);
  }, [cancelAutoRetry, href]);

  useEffect(() => {
    if (isPending) return;
    cancelAutoRetry();
    autoRetriesRef.current = 0;
  }, [cancelAutoRetry, isPending]);

  // Automatic retries keep this clock running; only a manual retry restarts it.
  useEffect(() => {
    setShowRetryAction(false);
    if (!isPending || hasFailed) return;
    const timeoutId = setTimeout(() => setShowRetryAction(true), COMIC_IMAGE_RETRY_ACTION_DELAY_MS);
    return () => clearTimeout(timeoutId);
  }, [hasFailed, href, isPending, manualRetryCount]);

  // One attempt per return to view: with retries used up, a dead page fails right back.
  const wasInViewRef = useRef(isInView);
  useEffect(() => {
    const enteredView = isInView && !wasInViewRef.current;
    wasInViewRef.current = isInView;
    if (enteredView && hasFailed) reload();
  }, [hasFailed, isInView, reload]);

  useEffect(() => {
    if (!hasFailed) return;
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [hasFailed, retry]);

  return { hasFailed, showRetryAction, reportImageError, retry };
};
