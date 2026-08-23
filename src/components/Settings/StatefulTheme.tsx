"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { ThemeKeyType, ThemeTokens, ThThemeKeys } from "@/preferences";
import { DECORATION_TOKEN_DEFAULTS } from "@/preferences/models";
import { withDecorationTokenDefaults } from "@/preferences/hooks/useTheming";
import { useSharedPreferences } from "@/preferences/hooks/useSharedPreferences";

import settingsStyles from "../Settings/assets/styles/thorium-web.reader.settings.module.css";

import CheckIcon from "./assets/icons/check.svg";

import { ThActionsKeys, ThLayoutDirection, ThSettingsContainerKeys } from "@/preferences/models";

import { StatefulRadioGroup } from "./StatefulRadioGroup";
import { Radio } from "react-aria-components";

import { useEpubNavigator } from "@/core/Hooks/Epub/useEpubNavigator";
import { useI18n } from "@/i18n/useI18n";
import { useGridNavigation } from "@/components/Settings/hooks/useGridNavigation";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setActionOpen } from "@/lib";
import { setSettingsContainer } from "@/lib/readerReducer";
import {
  type SavedCustomTheme,
  setCustomTheme,
  setSavedCustomThemes,
  setTheme
} from "@/lib/themeReducer";

import classNames from "classnames";
import { buildThemeObject } from "@/preferences/helpers/buildThemeObject";

export const StatefulTheme = () => {
  const profile = useAppSelector(state => state.reader.profile);
  const { theming } = useSharedPreferences();
  const { systemThemes, keys: preferenceThemeKeys, audioOrder: audioThemeOrder, reflowOrder: reflowThemeOrder, fxlOrder: fxlThemeOrder } = theming.themes;
  const { t } = useI18n();

  const radioGroupRef = useRef<HTMLDivElement | null>(null);
  const radioGroupWrapperRef = useRef<HTMLDivElement | null>(null);

  const isFXL = useAppSelector(state => state.publication.isFXL);
  const direction = useAppSelector(state => state.reader.direction);
  const isRTL = direction === ThLayoutDirection.rtl;

  const themeArray: (ThemeKeyType | "auto")[] = profile === "audio"
    ? ((audioThemeOrder ?? []) as (ThemeKeyType | "auto")[])
    : profile === "comic"
      ? ((fxlThemeOrder ?? []) as (ThemeKeyType | "auto")[])
      : (isFXL
          ? ((fxlThemeOrder ?? []) as (ThemeKeyType | "auto")[])
          : ((reflowThemeOrder ?? []) as (ThemeKeyType | "auto")[]));

  const themeObject = useAppSelector(state => state.theming.theme);
  const theme = profile === "audio" ? (themeObject.audio ?? "auto") : (isFXL ? (themeObject.fxl ?? "auto") : (themeObject.reflow ?? "auto"));
  const colorScheme = useAppSelector(state => state.theming.colorScheme);
  const coverTheme = useAppSelector(state => state.theming.coverTheme);
  const storedCustomThemes = useAppSelector(state => state.theming.customThemes);
  const themeKeys = useMemo(() => ({
    ...preferenceThemeKeys,
    ...storedCustomThemes
  }), [preferenceThemeKeys, storedCustomThemes]);

  const themeItems = useRef<(ThemeKeyType | "auto")[]>(
    themeArray.filter((theme: ThemeKeyType | "auto") => {
      if (theme === "auto") {
        return systemThemes !== undefined &&
          Object.values(systemThemes).every(t => themeArray.includes(t as ThemeKeyType));
      }
      return true;
    })
  );

  const dispatch = useAppDispatch();
  const openCustomTheme = useCallback(() => {
    dispatch(setSettingsContainer(ThSettingsContainerKeys.customTheme));
  }, [dispatch]);

  // Handling grid navigation through StatefulRadioGroup
  // would add a ton of complexity due to the extensive
  // logic for handling different types of children (render, node, etc.)
  // So we handle it here instead for the time being
  const { onKeyDown } = useGridNavigation({
    containerRef: radioGroupWrapperRef,
    items: themeItems,
    currentValue: theme,
    onChange: async (val) => {
      await updatePreference(val as ThemeKeyType);
      if (val === ThThemeKeys.custom) openCustomTheme();
    },
    isRTL,
    onEscape: () => {
      if (profile) {
        dispatch(setActionOpen({
          key: ThActionsKeys.settings,
          isOpen: false,
          profile
        }));
      }
    },
    onFocus: (id) => {
      const element = radioGroupWrapperRef.current?.querySelector(`[id="${ id }"]`);
    if (element) (element as HTMLElement).focus();
    }
  })

  const { submitPreferences } = useEpubNavigator();

  const updatePreference = useCallback(async (value: ThemeKeyType | "auto") => {
    const themeProps = buildThemeObject<typeof value>({
      theme: value,
      themeKeys: themeKeys ?? {},
      systemThemes: systemThemes as { light: ThemeKeyType; dark: ThemeKeyType } | undefined,
      colorScheme
    })
    await submitPreferences(themeProps);

    dispatch(setTheme({
      key: profile === "audio" ? "audio" : ((isFXL || profile === "comic") ? "fxl" : "reflow"),
      value: value
    }));
  }, [isFXL, themeKeys, systemThemes, submitPreferences, dispatch, colorScheme, profile]);

  // It's easier to inline styles from preferences for these
  // than spamming the entire app with all custom properties right now
  const doStyles = useCallback((t: ThemeKeyType | "auto") => {
    // For some reason Typescript will just refuse to create dts files
    // for the packages if we set it to CSSProperties…
    let cssProps: any = {
      boxSizing: "border-box",
      color: "#999999"
    };

    if (t === "auto") {
      if (profile === "audio" && coverTheme) {
        cssProps.background = coverTheme.background;
        cssProps.color = coverTheme.text;
        cssProps.border = `1px solid ${ coverTheme.subdue }`;
      } else if (systemThemes !== undefined) {
        cssProps.background = isRTL
        ? `linear-gradient(148deg, ${ themeKeys[systemThemes.dark].background } 48%, ${ themeKeys[systemThemes.light].background } 100%)`
        : `linear-gradient(148deg, ${ themeKeys[systemThemes.light].background } 0%, ${ themeKeys[systemThemes.dark].background } 48%)`;
        cssProps.color = "#ffffff";
        cssProps.border = `1px solid ${ themeKeys[systemThemes.light].subdue }`;
      } else {
        cssProps.display = "none";
      }
    } else {
      const theme = themeKeys[t as string];
      if (theme) {
        cssProps.background = theme.background;
        cssProps.color = theme.text;
        cssProps.border = `1px solid ${theme.subdue}`;
      }
    };

    return cssProps;
  }, [themeKeys, systemThemes, isRTL, profile, coverTheme]);

  // Edge case where the value stored is auto, but the array doesn't have it
  useEffect(() => {
    if (theme === "auto" && !themeItems.current.includes(theme)) {
      updatePreference(themeItems.current[0]);
    }
  }, [theme, updatePreference]);

  return (
    <>
    <StatefulRadioGroup
      ref={ radioGroupRef }
      standalone={ true }
      label={ t("reader.preferences.themes.title") }
      value={ theme }
      onChange={ async (val) => {
        await updatePreference(val as ThemeKeyType);
        if (val === ThThemeKeys.custom) openCustomTheme();
      } }
      useGraphicalNavigation={ false }
    >
      <div
        ref={ radioGroupWrapperRef }
        className={ classNames(settingsStyles.radioWrapper, settingsStyles.themesWrapper)
      }>
        { themeItems.current.map(( themeItem ) =>
          <Radio
            className={ classNames(
              settingsStyles.radio,
              settingsStyles.themeRadio
            ) }
            value={ themeItem }
            id={ themeItem }
            key={ themeItem }
            style={ doStyles(themeItem) }
            onKeyDown={ onKeyDown }
            onPress={
              themeItem === ThThemeKeys.custom && theme === ThThemeKeys.custom
                ? openCustomTheme
                : undefined
            }
          >
          <span>
            { t(`reader.preferences.themes.${ themeItem }`, {
              defaultValue: themeItem === ThThemeKeys.custom ? "Custom" : themeItem
            }) }
            { themeItem === theme && <CheckIcon aria-hidden="true" focusable="false" /> }
          </span>
        </Radio>
        ) }
      </div>
    </StatefulRadioGroup>
    </>
  )
}

type EditableThemeToken = keyof Pick<
  ThemeTokens,
  "background" | "text" | "subdue" | "link" | "visited" | "highlight" | "dictionary"
>;

const maxSavedCustomThemes = 12;

const customThemeFingerprint = (theme: ThemeTokens) => [
  theme.background,
  theme.text,
  theme.subdue,
  theme.link,
  theme.visited,
  theme.highlight ?? DECORATION_TOKEN_DEFAULTS.highlight,
  theme.dictionary ?? DECORATION_TOKEN_DEFAULTS.dictionary
].join("|");

const createSavedCustomThemeId = () =>
  `${ Date.now().toString(36) }-${ Math.random().toString(36).slice(2, 9) }`;

const customThemeFields: Array<{
  key: EditableThemeToken;
  label: string;
}> = [
  { key: "background", label: "Background" },
  { key: "text", label: "Text" },
  { key: "subdue", label: "Alternate text" },
  { key: "link", label: "Links" },
  { key: "visited", label: "Visited links" },
  { key: "highlight", label: "Highlights" },
  { key: "dictionary", label: "Dictionary marks" }
];

export const StatefulCustomTheme = () => {
  const { theming } = useSharedPreferences();
  const { systemThemes, keys: preferenceThemeKeys } = theming.themes;
  const storedCustomThemes = useAppSelector(state => state.theming.customThemes);
  const colorScheme = useAppSelector(state => state.theming.colorScheme);
  const themeKeys = useMemo(() => ({
    ...preferenceThemeKeys,
    ...storedCustomThemes
  }), [preferenceThemeKeys, storedCustomThemes]);
  const theme = useMemo(
    () => themeKeys[ThThemeKeys.custom]
      ? withDecorationTokenDefaults(themeKeys[ThThemeKeys.custom])
      : undefined,
    [themeKeys]
  );
  const dispatch = useAppDispatch();
  const { submitPreferences } = useEpubNavigator();
  const savedThemes = useAppSelector(state => state.theming.savedCustomThemes) ?? [];
  const savedThemesRef = useRef(savedThemes);
  const editingSavedThemeId = useRef<string | null>(null);

  const commitSavedThemes = useCallback((nextThemes: SavedCustomTheme[]) => {
    savedThemesRef.current = nextThemes;
    dispatch(setSavedCustomThemes(nextThemes));
  }, [dispatch]);

  useEffect(() => {
    savedThemesRef.current = savedThemes;
  }, [savedThemes]);

  const saveThemeToHistory = useCallback((tokens: ThemeTokens) => {
    const id = editingSavedThemeId.current ?? createSavedCustomThemeId();
    editingSavedThemeId.current = id;
    const fingerprint = customThemeFingerprint(tokens);
    const nextThemes = [
      { id, tokens, updatedAt: Date.now() },
      ...savedThemesRef.current.filter(savedTheme =>
        savedTheme.id !== id &&
        customThemeFingerprint(savedTheme.tokens) !== fingerprint
      )
    ].slice(0, maxSavedCustomThemes);

    commitSavedThemes(nextThemes);
  }, [commitSavedThemes]);

  const applyCustomTheme = useCallback(async (next: ThemeTokens) => {
    dispatch(setCustomTheme({ key: ThThemeKeys.custom, tokens: next }));
    await submitPreferences(buildThemeObject({
      theme: ThThemeKeys.custom,
      themeKeys: {
        ...themeKeys,
        [ThThemeKeys.custom]: next
      },
      systemThemes,
      colorScheme
    }));
  }, [colorScheme, dispatch, submitPreferences, systemThemes, themeKeys]);

  const updateCustomTheme = useCallback(async (
    key: EditableThemeToken,
    value: string
  ) => {
    if (!theme) return;

    const next = {
      ...theme,
      [key]: value
    };
    saveThemeToHistory(next);
    await applyCustomTheme(next);
  }, [applyCustomTheme, saveThemeToHistory, theme]);

  const selectSavedTheme = useCallback(async (savedTheme: SavedCustomTheme) => {
    editingSavedThemeId.current = null;
    await applyCustomTheme(savedTheme.tokens);
  }, [applyCustomTheme]);

  return theme
    ? <CustomThemeEditor
        theme={ theme }
        savedThemes={ savedThemes }
        onChange={ updateCustomTheme }
        onSelectSavedTheme={ selectSavedTheme }
      />
    : null;
};

const CustomThemeEditor = ({
  theme,
  savedThemes,
  onChange,
  onSelectSavedTheme
}: {
  theme: ThemeTokens;
  savedThemes: SavedCustomTheme[];
  onChange: (key: EditableThemeToken, value: string) => void;
  onSelectSavedTheme: (theme: SavedCustomTheme) => void;
}) => {
  const currentFingerprint = customThemeFingerprint(theme);

  return (
  <section className={ settingsStyles.customThemeEditor } aria-label="Custom palette">
    <div
      className={ settingsStyles.customThemePreview }
      style={ {
        background: theme.background,
        color: theme.text,
        borderColor: theme.subdue
      } }
    >
      <strong>The quick brown fox</strong>
      <span style={ { color: theme.subdue } }>Secondary text and reading details</span>
      <span className={ settingsStyles.customThemePreviewLink } style={ { color: theme.link } }>
        A link inside the publication
      </span>
      <span style={ {
        color: theme.text,
        backgroundColor: theme.highlight ?? DECORATION_TOKEN_DEFAULTS.highlight
      } }>
        Highlighted text as it appears while reading
      </span>
    </div>
    <div className={ settingsStyles.customThemeFields }>
      { customThemeFields.map(({ key, label }) =>
        <fieldset className={ settingsStyles.customThemeField } key={ key }>
          <legend>{ label }</legend>
          <span>
            <input
              type="color"
              value={ theme[key] }
              aria-label={ `${ label } color picker` }
              onChange={ event => onChange(key, event.target.value) }
            />
            <input
              key={ `${ key }-${ theme[key] }` }
              type="text"
              defaultValue={ theme[key] }
              maxLength={ 7 }
              pattern="^#[0-9a-fA-F]{6}$"
              spellCheck={ false }
              aria-label={ `${ label } hex color` }
              onBlur={ event => {
                if (/^#[0-9a-f]{6}$/i.test(event.target.value)) {
                  onChange(key, event.target.value.toLowerCase());
                } else {
                  event.target.value = theme[key] ?? "";
                }
              } }
            />
          </span>
        </fieldset>
      ) }
    </div>
    { savedThemes.length > 0 &&
      <section className={ settingsStyles.savedCustomThemes } aria-labelledby="saved-custom-themes-heading">
        <h3 id="saved-custom-themes-heading">Saved themes</h3>
        <div className={ settingsStyles.savedCustomThemeGrid }>
          { savedThemes.map((savedTheme, index) => {
            const isSelected = customThemeFingerprint(savedTheme.tokens) === currentFingerprint;
            return (
              <button
                type="button"
                className={ settingsStyles.savedCustomTheme }
                key={ savedTheme.id }
                data-selected={ isSelected }
                aria-pressed={ isSelected }
                aria-label={ `Apply saved theme ${ index + 1 }` }
                onClick={ () => onSelectSavedTheme(savedTheme) }
              >
                <span
                  className={ settingsStyles.savedCustomThemeSample }
                  style={ {
                    background: savedTheme.tokens.background,
                    color: savedTheme.tokens.text,
                    borderColor: savedTheme.tokens.subdue
                  } }
                >
                  <strong>Aa</strong>
                  <span style={ { color: savedTheme.tokens.link } }>●</span>
                </span>
                <span className={ settingsStyles.savedCustomThemeSwatches } aria-hidden="true">
                  { [
                    { key: "background", color: savedTheme.tokens.background },
                    { key: "text", color: savedTheme.tokens.text },
                    { key: "subdue", color: savedTheme.tokens.subdue },
                    { key: "link", color: savedTheme.tokens.link },
                    { key: "visited", color: savedTheme.tokens.visited },
                    { key: "highlight", color: savedTheme.tokens.highlight ?? DECORATION_TOKEN_DEFAULTS.highlight },
                    { key: "dictionary", color: savedTheme.tokens.dictionary ?? DECORATION_TOKEN_DEFAULTS.dictionary }
                  ].map(swatch =>
                    <span key={ swatch.key } style={ { background: swatch.color } } />
                  ) }
                </span>
                <span className={ settingsStyles.savedCustomThemeLabel }>
                  Saved theme { index + 1 }
                  { isSelected && <CheckIcon aria-hidden="true" focusable="false" /> }
                </span>
              </button>
            );
          }) }
        </div>
      </section>
    }
  </section>
  );
};
