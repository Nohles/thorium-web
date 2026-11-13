"use client";

import React, { useCallback, useState, useMemo } from "react";

import audioStyles from "./assets/styles/thorium-web.audioProgressBar.module.css";

import { ThAudioProgress } from "@/core/Components/Audio/ThAudioProgress";

import { useNavigator } from "@/core/Navigator";
import { useAppSelector } from "@/lib";
import { useI18n } from "@/i18n/useI18n";
import { useAudioPreferences } from "@/preferences/hooks/useAudioPreferences";
import { ThAudioProgressBarVariant } from "@/preferences/models/ui";

import {
  AudioBookClockNavigator,
  AudioTimelineItemLike,
  AudioTocLinkLike,
  audioBookClock,
  chapterIndexAt,
  defaultAudioProgressScope,
  formatTimeLeft,
  progressChapters,
  progressWindow,
  seekBookTime,
  trackStartTitles,
} from "./progressScope";

export const StatefulAudioProgressBar = () => {
  const { t } = useI18n();
  const { preferences } = useAudioPreferences();

  const tocEntry = useAppSelector(state => state.publication.toc?.currentEntry);

  const isStalled = useAppSelector(state => state.player.isStalled);
  const isTrackReady = useAppSelector(state => state.player.isTrackReady);
  const seekableRanges = useAppSelector(state => state.player.seekableRanges);
  const playbackRate = useAppSelector(state => state.audioSettings.playbackRate);
  const progressScope = useAppSelector(state => state.audioSettings.progressScope) ?? defaultAudioProgressScope;

  const media = useNavigator().media;
  const { currentTime, duration, seek, currentLocator, timeline } = media;

  const trackTime = currentTime();
  const trackDuration = duration();
  const trackHref = currentLocator()?.href.split("#")[0] ?? "";
  const tl = timeline();
  const segmented = preferences.theming.layout.progressBar?.variant === ThAudioProgressBarVariant.segmented;

  // The book clock: every track laid end to end. Until every track's length
  // is known it falls back to the playing track alone, the old behaviour.
  // Recomputed per render: the navigator's time moves without a state change.
  const bookClock = audioBookClock(media as unknown as AudioBookClockNavigator);
  const trackChapters = useMemo(() => {
    const tracks = [{ href: trackHref, duration: trackDuration }];
    const items = ((tl?.items ?? []) as AudioTimelineItemLike[])
      .filter(item => item.references[0]?.split("#")[0] === trackHref);
    return progressChapters(items, tracks, [0], trackStartTitles((tl as unknown as { tocLinks?: AudioTocLinkLike[] } | undefined)?.tocLinks));
  }, [tl, trackHref, trackDuration]);
  const clock = bookClock
    ? { chapters: bookClock.chapters, total: bookClock.total, position: bookClock.position }
    : { chapters: trackChapters, total: trackDuration, position: trackTime };

  const position = clock.position;
  const bar = progressWindow(progressScope, clock.chapters, position, clock.total);
  const span = Math.max(0, bar.end - bar.start);
  // Named from the same chapter list the bar is cut from, so the two agree.
  const chapterIndex = chapterIndexAt(clock.chapters, position);
  const currentChapter = (chapterIndex >= 0 ? clock.chapters[chapterIndex].title : undefined) ?? tocEntry?.title;

  const [hoverLabel, setHoverLabel] = useState<string | undefined>(undefined);

  const handleSeek = useCallback((value: number) => {
    const target = bar.start + value;
    const current = audioBookClock(media as unknown as AudioBookClockNavigator);
    if (current) seekBookTime(media as unknown as AudioBookClockNavigator, current, target);
    else seek(target);
  }, [bar.start, media, seek]);

  const handleHoverProgression = useCallback((progression: number | null) => {
    if (progression === null) {
      setHoverLabel(undefined);
      return;
    }
    const index = chapterIndexAt(clock.chapters, bar.start + progression * span);
    setHoverLabel(index >= 0 ? clock.chapters[index].title : undefined);
  }, [clock.chapters, bar.start, span]);

  // Chapter starts inside the span, as ticks. The span's own start needs none.
  const segments = useMemo(() => {
    if (!segmented || span <= 0) return [];
    return clock.chapters
      .filter(chapter => chapter.start > bar.start && chapter.start < bar.end)
      .map(chapter => ({
        title: chapter.title,
        timestamp: chapter.start - bar.start,
        percentage: ((chapter.start - bar.start) / span) * 100
      }));
  }, [segmented, clock.chapters, bar.start, bar.end, span]);

  // Buffered ranges are for the playing track; shift them onto the span.
  const spanSeekableRanges = useMemo(() => {
    const trackStart = bookClock ? bookClock.offsets[bookClock.trackIndex] : 0;
    const shift = trackStart - bar.start;
    return seekableRanges
      .map(range => ({
        start: Math.max(0, range.start + shift),
        end: Math.min(span, range.end + shift)
      }))
      .filter(range => range.end > range.start);
  }, [seekableRanges, bookClock, bar.start, span]);

  const bookLeft = bookClock && clock.total > 0
    ? t("reader.playback.preferences.audio.timeLeft", {
        time: formatTimeLeft((clock.total - position) / (playbackRate || 1))
      })
    : undefined;

  return (
    <ThAudioProgress
      currentTime={ Math.max(0, Math.min(span, position - bar.start)) }
      duration={ span }
      playbackRate={ playbackRate }
      onSeek={ handleSeek }
      currentChapter={ currentChapter || "​" } // Zero-width space to prevent shift
      isDisabled={ !isTrackReady || isStalled }
      seekableRanges={ spanSeekableRanges }
      hoverLabel={ hoverLabel }
      onHoverProgression={ handleHoverProgression }
      segments={ segments }
      summary={ bookLeft }
      compounds={{
        wrapper: {
          className: audioStyles.wrapper,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Escape") (document.activeElement as HTMLElement)?.blur();
          }
        },
        current: {
          className: audioStyles.current
        },
        slider: {
          className: audioStyles.slider,
          "aria-label": t("audio.player.progress")
        },
        track: {
          className: audioStyles.track
        },
        thumb: {
          className: audioStyles.thumb
        },
        elapsedTime: {
          className: audioStyles.elapsed
        },
        remainingTime: {
          className: audioStyles.remaining
        },
        summary: {
          className: audioStyles.summary
        },
        seekableRange: {
          className: audioStyles.seekableRange
        },
        fragmentTick: {
          className: audioStyles.tick
        },
        tooltip: {
          className: audioStyles.tooltip,
          offset: preferences.theming.icon.tooltipOffset
        }
      }}
    />
  );
};
