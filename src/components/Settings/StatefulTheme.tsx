"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { ThemeKeyType, ThemeTokens, ThThemeKeys } from "@/preferences";
import { DECORATION_TOKEN_DEFAULTS, customTheme } from "@/preferences/models";
import { withDecorationTokenDefaults } from "@/preferences/hooks/useTheming";
import { useSharedPreferences } from "@/preferences/hooks/useSharedPreferences";

import settingsStyles from "../Settings/assets/styles/thorium-web.reader.settings.module.css";

import CheckIcon from "./assets/icons/check.svg";
import EditIcon from "./assets/icons/edit.svg";
import AddIcon from "@/core/Components/Settings/assets/icons/add.svg";
import DeleteIcon from "@/core/Components/Buttons/assets/icons/delete.svg";

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
  const coverTheme = useAppSelector(state => state.publication.coverTheme);
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

const maxSavedCustomThemes = 40;

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

const savedThemeName = (theme: SavedCustomTheme, index: number) =>
  theme.name?.trim() || `Saved theme ${ index + 1 }`;

/**
 * The Custom theme panel. At rest it is a library of saved themes — pick one to
 * read with it, or create a new one. Editing is a level below, entered from a
 * theme's pencil or from Create, and the host's Back returns to the library.
 *
 * `editingId` lives in the host container so its header and Back button can
 * follow the two levels.
 */
export const StatefulCustomTheme = ({
  editingId,
  onEditingChange
}: {
  editingId: string | null;
  onEditingChange: (id: string | null) => void;
}) => {
  const { theming } = useSharedPreferences();
  const { systemThemes, keys: preferenceThemeKeys } = theming.themes;
  const storedCustomThemes = useAppSelector(state => state.theming.customThemes);
  const colorScheme = useAppSelector(state => state.theming.colorScheme);
  const themeKeys = useMemo(() => ({
    ...preferenceThemeKeys,
    ...storedCustomThemes
  }), [preferenceThemeKeys, storedCustomThemes]);
  const current = useMemo(
    () => themeKeys[ThThemeKeys.custom]
      ? withDecorationTokenDefaults(themeKeys[ThThemeKeys.custom])
      : undefined,
    [themeKeys]
  );
  const dispatch = useAppDispatch();
  const { submitPreferences } = useEpubNavigator();
  const savedThemes = useAppSelector(state => state.theming.savedCustomThemes) ?? [];
  // Colour pickers fire many changes per second; reading the list from a ref
  // keeps each one building on the last instead of on a stale render.
  const savedThemesRef = useRef(savedThemes);
  useEffect(() => {
    savedThemesRef.current = savedThemes;
  }, [savedThemes]);

  const commitSavedThemes = useCallback((nextThemes: SavedCustomTheme[]) => {
    savedThemesRef.current = nextThemes;
    dispatch(setSavedCustomThemes(nextThemes));
  }, [dispatch]);

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

  const updateSavedTheme = useCallback((
    id: string,
    patch: Partial<Pick<SavedCustomTheme, "name" | "tokens">>
  ) => {
    commitSavedThemes(savedThemesRef.current.map(savedTheme =>
      savedTheme.id === id
        ? { ...savedTheme, ...patch, updatedAt: Date.now() }
        : savedTheme
    ));
  }, [commitSavedThemes]);

  const createTheme = useCallback(async () => {
    const tokens = withDecorationTokenDefaults(current ?? customTheme);
    const id = createSavedCustomThemeId();
    commitSavedThemes([
      {
        id,
        name: `Theme ${ savedThemesRef.current.length + 1 }`,
        tokens,
        updatedAt: Date.now()
      },
      ...savedThemesRef.current
    ].slice(0, maxSavedCustomThemes));
    onEditingChange(id);
    await applyCustomTheme(tokens);
  }, [applyCustomTheme, commitSavedThemes, current, onEditingChange]);

  const editing = editingId
    ? savedThemes.find(savedTheme => savedTheme.id === editingId)
    : undefined;

  // The theme being edited was removed elsewhere; fall back to the library.
  useEffect(() => {
    if (editingId && !editing) onEditingChange(null);
  }, [editing, editingId, onEditingChange]);

  if (editing) {
    const tokens = withDecorationTokenDefaults(editing.tokens);
    return (
      <CustomThemeEditor
        key={ editing.id }
        name={ editing.name ?? "" }
        theme={ tokens }
        onRename={ name => updateSavedTheme(editing.id, { name }) }
        onChange={ async (key, value) => {
          const next = { ...tokens, [key]: value };
          updateSavedTheme(editing.id, { tokens: next });
          await applyCustomTheme(next);
        } }
        onDelete={ () => {
          commitSavedThemes(savedThemesRef.current.filter(savedTheme => savedTheme.id !== editing.id));
          onEditingChange(null);
        } }
        onDone={ () => onEditingChange(null) }
      />
    );
  }

  const currentFingerprint = current ? customThemeFingerprint(current) : null;

  return (
    <CustomThemeLibrary
      savedThemes={ savedThemes }
      isSelected={ savedTheme => customThemeFingerprint(savedTheme.tokens) === currentFingerprint }
      onSelect={ savedTheme => applyCustomTheme(savedTheme.tokens) }
      onEdit={ async savedTheme => {
        onEditingChange(savedTheme.id);
        await applyCustomTheme(savedTheme.tokens);
      } }
      onCreate={ createTheme }
    />
  );
};

const CustomThemeLibrary = ({
  savedThemes,
  isSelected,
  onSelect,
  onEdit,
  onCreate
}: {
  savedThemes: SavedCustomTheme[];
  isSelected: (theme: SavedCustomTheme) => boolean;
  onSelect: (theme: SavedCustomTheme) => void;
  onEdit: (theme: SavedCustomTheme) => void;
  onCreate: () => void;
}) => (
  <section className={ settingsStyles.customThemeLibrary } aria-label="Custom themes">
    { savedThemes.length === 0 &&
      <p className={ settingsStyles.customThemeEmpty }>
        No saved themes yet. Create one, or add themes from Settings, then Appearance.
      </p>
    }
    <div className={ settingsStyles.customThemeGrid }>
      { savedThemes.map((savedTheme, index) => {
        const selected = isSelected(savedTheme);
        const name = savedThemeName(savedTheme, index);
        const tokens = withDecorationTokenDefaults(savedTheme.tokens);
        return (
          <div
            className={ settingsStyles.customThemeCard }
            data-selected={ selected }
            key={ savedTheme.id }
          >
            <button
              type="button"
              className={ settingsStyles.customThemeCardSelect }
              aria-pressed={ selected }
              aria-label={ `Read with ${ name }` }
              onClick={ () => onSelect(savedTheme) }
            >
              <CustomThemeSample theme={ tokens } />
              <span className={ settingsStyles.customThemeCardName }>
                <span>{ name }</span>
                { selected && <CheckIcon aria-hidden="true" focusable="false" /> }
              </span>
            </button>
            <button
              type="button"
              className={ settingsStyles.customThemeCardEdit }
              aria-label={ `Edit ${ name }` }
              title="Edit"
              onClick={ () => onEdit(savedTheme) }
            >
              <EditIcon aria-hidden="true" focusable="false" />
            </button>
          </div>
        );
      }) }
      <button
        type="button"
        className={ settingsStyles.customThemeCreate }
        onClick={ onCreate }
      >
        <AddIcon aria-hidden="true" focusable="false" />
        <span>Create theme</span>
      </button>
    </div>
  </section>
);

/** A miniature page in the theme's own colors: title, text, link, highlight. */
const CustomThemeSample = ({ theme }: { theme: ThemeTokens }) => (
  <span
    className={ settingsStyles.customThemeSample }
    aria-hidden="true"
    style={ { background: theme.background, color: theme.text } }
  >
    <strong>Aa</strong>
    <span style={ { background: theme.subdue } } />
    <span style={ { background: theme.subdue, width: "70%" } } />
    <span className={ settingsStyles.customThemeSampleMarks }>
      <span style={ { background: theme.link } } />
      <span style={ { background: theme.highlight ?? DECORATION_TOKEN_DEFAULTS.highlight } } />
    </span>
  </span>
);

const CustomThemeEditor = ({
  name,
  theme,
  onRename,
  onChange,
  onDelete,
  onDone
}: {
  name: string;
  theme: ThemeTokens;
  onRename: (name: string) => void;
  onChange: (key: EditableThemeToken, value: string) => void;
  onDelete: () => void;
  onDone: () => void;
}) => (
  <section className={ settingsStyles.customThemeEditor } aria-label="Edit theme">
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
      <span>
        <mark style={ {
          color: theme.text,
          backgroundColor: theme.highlight ?? DECORATION_TOKEN_DEFAULTS.highlight
        } }>
          Highlighted text
        </mark>
        { " " }
        <mark style={ {
          color: theme.text,
          backgroundColor: theme.dictionary ?? DECORATION_TOKEN_DEFAULTS.dictionary
        } }>
          Dictionary mark
        </mark>
      </span>
    </div>
    <label className={ settingsStyles.customThemeName }>
      <span>Name</span>
      <input
        type="text"
        defaultValue={ name }
        placeholder="Untitled theme"
        maxLength={ 60 }
        onBlur={ event => {
          const next = event.target.value.trim();
          if (next !== name) onRename(next);
        } }
        onKeyDown={ event => {
          if (event.key === "Enter") event.currentTarget.blur();
        } }
      />
    </label>
    <div className={ settingsStyles.customThemeFields } role="group" aria-label="Colors">
      { customThemeFields.map(({ key, label }) =>
        <div className={ settingsStyles.customThemeField } key={ key }>
          <span>{ label }</span>
          <span className={ settingsStyles.customThemeFieldControls }>
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
              onKeyDown={ event => {
                if (event.key === "Enter") event.currentTarget.blur();
              } }
            />
          </span>
        </div>
      ) }
    </div>
    <div className={ settingsStyles.customThemeActions }>
      <button
        type="button"
        className={ settingsStyles.customThemeDelete }
        onClick={ onDelete }
      >
        <DeleteIcon aria-hidden="true" focusable="false" />
        Delete
      </button>
      <button
        type="button"
        className={ settingsStyles.customThemeDone }
        onClick={ onDone }
      >
        Done
      </button>
    </div>
  </section>
);
