"use client";

import { ComponentType, ReactNode, SVGProps, useRef, useState } from "react";

import classNames from "classnames";

import { Dialog, Popover } from "react-aria-components";

import PauseIcon from "../Audio/controls/assets/icons/pause.svg";
import PlayIcon from "../Audio/controls/assets/icons/play_arrow.svg";
import ReplayIcon from "../Audio/controls/assets/icons/replay.svg";
import VolumeUpIcon from "../Audio/actions/Volume/assets/icons/volume_up.svg";
import VolumeDownIcon from "../Audio/actions/Volume/assets/icons/volume_down.svg";
import VolumeMuteIcon from "../Audio/actions/Volume/assets/icons/volume_mute.svg";
import VolumeOffIcon from "../Audio/actions/Volume/assets/icons/volume_off.svg";
import CloseIcon from "@/core/Components/Buttons/assets/icons/close.svg";

import readerSharedUI from "../assets/styles/thorium-web.button.module.css";
import audioStyles from "../Audio/controls/assets/styles/thorium-web.audioPlayback.module.css";
import volumeStyles from "../Audio/actions/Volume/assets/styles/thorium-web.volume.module.css";
import styles from "../assets/styles/thorium-web.readAlongBar.module.css";

import { StatefulActionIcon } from "../Actions/Triggers/StatefulActionIcon";
import { ThAudioProgress, TimelineSegment } from "@/core/Components/Audio/ThAudioProgress";
import { ThSlider } from "@/core/Components/Settings/ThSlider";

import { useI18n } from "@/i18n/useI18n";

import { isIOSish } from "@/core/Helpers/getPlatform";

export interface ReadAlongBarAction {
  id: string;
  label: string;
  onPress: () => void;
  /** Shown as an icon; `text` takes its place for values such as "1.5×". */
  Icon?: ComponentType<SVGProps<SVGElement>>;
  text?: string;
  /** Rendered as a pressed toggle when defined. */
  isActive?: boolean;
  /** Dropped when the bar is narrow. */
  hideWhenCompact?: boolean;
}

export interface ReadAlongBarSkip {
  seconds: number;
  label: string;
  onPress: () => void;
}

export interface ReadAlongBarVolume {
  /** From 0 to 1. */
  value: number;
  label: string;
  onChange: (value: number) => void;
}

export interface StatefulReadAlongBarProps {
  /** Names the bar for assistive technology. */
  label: string;
  title: string;
  coverUrl?: string | null;
  /** The line under the title, such as the chapter and time. */
  meta: string;
  status?: { tone: string; label: string; detail?: string };
  position: number;
  duration: number;
  segments?: TimelineSegment[];
  isPlaying: boolean;
  isLoading?: boolean;
  /** Audio is downloading: show it, but keep the button usable. */
  isBuffering?: boolean;
  onPlayPause: () => void;
  onSeek: (seconds: number) => void;
  skipBackward: ReadAlongBarSkip;
  skipForward: ReadAlongBarSkip;
  /** Left out where the browser controls the volume, such as iOS. */
  volume?: ReadAlongBarVolume;
  actions?: ReadAlongBarAction[];
  /** Ends listening; the reader stays open where it is. */
  close: { label: string; onPress: () => void };
  /** A message pinned above the bar. */
  notice?: { tone: "info" | "error"; message: string } | null;
  /** Rendered inside the bar, for controls that position themselves. */
  children?: ReactNode;
}

const VOLUME_RANGE = [0, 1];
const VOLUME_STEP = 0.05;

const volumeIcon = (value: number) => {
  if (value === 0) return VolumeOffIcon;
  if (value <= 1 / 3) return VolumeMuteIcon;
  if (value <= 2 / 3) return VolumeDownIcon;
  return VolumeUpIcon;
};

/** A button that opens into a slider, like the audiobook player's volume. */
const ReadAlongVolume = ({ value, label, onChange }: ReadAlongBarVolume) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const VolumeIcon = volumeIcon(value);

  return (
    <>
      <StatefulActionIcon
        ref={ triggerRef }
        className={ classNames(readerSharedUI.icon, styles.hideCompact) }
        aria-label={ label }
        aria-expanded={ isOpen }
        tooltipLabel={ label }
        placement="top"
        onPress={ () => setIsOpen((open) => !open) }
      >
        <VolumeIcon aria-hidden="true" focusable="false" />
      </StatefulActionIcon>
      <Popover
        triggerRef={ triggerRef }
        placement="top"
        className={ styles.volumePopover }
        isOpen={ isOpen }
        onOpenChange={ setIsOpen }
      >
        <Dialog aria-label={ label } className={ styles.volumeDialog }>
          <ThSlider
            aria-label={ label }
            className={ volumeStyles.slider }
            orientation="vertical"
            range={ VOLUME_RANGE }
            step={ VOLUME_STEP }
            value={ value }
            onChange={ (next) => onChange(Array.isArray(next) ? next[0] : next) }
            compounds={{
              track: { className: volumeStyles.sliderTrack },
              thumb: { className: volumeStyles.sliderThumb, autoFocus: true },
              output: { style: () => ({ display: "none" }) },
            }}
          />
        </Dialog>
      </Popover>
    </>
  );
};

/**
 * Audio controls for a publication read with narration. Pass it as the reader's
 * `navigation.footer`: the host owns the audio, and the bar shares the reader's
 * buttons, theme and layout.
 */
export const StatefulReadAlongBar = ({
  label,
  title,
  coverUrl,
  meta,
  status,
  position,
  duration,
  segments,
  isPlaying,
  isLoading,
  isBuffering,
  onPlayPause,
  onSeek,
  skipBackward,
  skipForward,
  volume,
  actions,
  close,
  notice,
  children,
}: StatefulReadAlongBarProps) => {
  const { t } = useI18n();
  const playPauseLabel = isPlaying ? t("reader.playback.actions.pause") : t("reader.playback.actions.play");

  const skipButton = (skip: ReadAlongBarSkip, direction: "back" | "forward", className?: string) => (
    <StatefulActionIcon
      className={ classNames(readerSharedUI.icon, styles.skip, className) }
      aria-label={ skip.label }
      tooltipLabel={ skip.label }
      placement="top"
      isDisabled={ isLoading }
      onPress={ skip.onPress }
    >
      <ReplayIcon className={ direction === "forward" ? styles.mirrored : undefined } aria-hidden="true" focusable="false" />
      <span className={ styles.skipSeconds } aria-hidden="true">{ skip.seconds }</span>
    </StatefulActionIcon>
  );

  return (
    <div className={ styles.bar } role="region" aria-label={ label }>
      <ThAudioProgress
        currentTime={ position }
        duration={ duration }
        onSeek={ onSeek }
        isDisabled={ isLoading }
        segments={ segments }
        seekableRanges={ duration > 0 ? [{ start: 0, end: Math.min(position, duration) }] : undefined }
        compounds={{
          wrapper: { className: styles.timeline },
          slider: { className: styles.slider, "aria-label": t("audio.player.progress") },
          track: { className: styles.track },
          thumb: { className: styles.thumb },
          fragmentTick: { className: styles.tick },
          seekableRange: { className: styles.played },
          elapsedTime: { className: styles.hiddenTime },
          remainingTime: { className: styles.hiddenTime },
        }}
      />

      { notice ? (
        <div className={ styles.notice } data-tone={ notice.tone } role="status">{ notice.message }</div>
      ) : null }

      <div className={ styles.start }>
        { coverUrl ? <img src={ coverUrl } alt="" className={ styles.cover } /> : null }
        <div className={ styles.text }>
          <div className={ styles.title } title={ title }>{ title }</div>
          <div className={ styles.meta }>
            { status ? (
              <span
                className={ styles.status }
                data-tone={ status.tone }
                role="img"
                aria-label={ status.label }
                title={ status.detail ? `${ status.label }. ${ status.detail }` : status.label }
              />
            ) : null }
            <span className={ styles.metaText }>{ meta }</span>
          </div>
        </div>
      </div>

      <div className={ styles.center }>
        { skipButton(skipBackward, "back") }
        <StatefulActionIcon
          className={ classNames(readerSharedUI.icon, audioStyles.audioPlayPauseButton, styles.playPause) }
          aria-label={ playPauseLabel }
          aria-busy={ isBuffering || isLoading || undefined }
          tooltipLabel={ playPauseLabel }
          placement="top"
          isDisabled={ isLoading }
          onPress={ onPlayPause }
          data-busy={ isBuffering || undefined }
        >
          { isPlaying
            ? <PauseIcon aria-hidden="true" focusable="false" />
            : <PlayIcon aria-hidden="true" focusable="false" /> }
        </StatefulActionIcon>
        { skipButton(skipForward, "forward", styles.hideCompact) }
      </div>

      <div className={ styles.end }>
        { volume && !isIOSish() ? <ReadAlongVolume { ...volume } /> : null }
        { actions?.map(({ id, label: actionLabel, onPress, Icon, text, isActive, hideWhenCompact }) => (
          <StatefulActionIcon
            key={ id }
            className={ classNames(readerSharedUI.icon, text ? styles.textAction : undefined, hideWhenCompact && styles.hideCompact) }
            aria-label={ actionLabel }
            aria-pressed={ isActive }
            tooltipLabel={ actionLabel }
            placement="top"
            onPress={ onPress }
          >
            { text ?? (Icon ? <Icon aria-hidden="true" focusable="false" /> : null) }
          </StatefulActionIcon>
        )) }
        <StatefulActionIcon
          className={ readerSharedUI.icon }
          aria-label={ close.label }
          tooltipLabel={ close.label }
          placement="top"
          onPress={ close.onPress }
        >
          <CloseIcon aria-hidden="true" focusable="false" />
        </StatefulActionIcon>
      </div>

      { children }
    </div>
  );
};
