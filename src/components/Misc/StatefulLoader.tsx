import { ReactNode } from "react";

import readerLoaderStyles from "./assets/styles/thorium-web.loader.module.css";

import { ThLoader } from "@/core/Components/Reader/ThLoader";

import { useI18n } from "@/i18n/useI18n";

export interface StatefulLoaderProps {
  isLoading: boolean;
  children: ReactNode;
  /**
   * Replaces the built-in loader screen.
   *
   * Host applications own the surrounding chrome, so by default they want to
   * paint the loading surface themselves — for example to keep an opaque
   * backdrop in the host's own theme so the reader's theme can be applied
   * underneath it and revealed in a single step, instead of flashing an
   * intermediate colour while the reader boots.
   *
   * The node is responsible for its own styling, including covering the
   * loader area. Omit to keep the built-in spinner and "Loading" label.
   */
  loader?: ReactNode;
}

const LOADING_KEY = "reader.app.loading";

/**
 * The built-in loading screen, as a bare node.
 *
 * Exported so that places which need a loading surface *inside* an already
 * mounting `StatefulLoader` — a `Suspense` fallback, for instance — show the
 * same thing rather than diverging from it.
 *
 * Calls `useI18n`, so it must render below `ThI18nProvider`.
 */
export const DefaultLoaderScreen = () => {
  const { t } = useI18n();

  // `useI18n` echoes the key back when a namespace is not loaded yet, which can
  // happen on a cold first open. Showing the raw key is worse than showing the
  // untranslated English label.
  const translated = t(LOADING_KEY);

  return (
    <div className={ readerLoaderStyles.loader }>
      { translated === LOADING_KEY ? "Loading" : translated }
    </div>
  );
}

/**
 * The built-in spinner with no label.
 *
 * For surfaces that render above `ThI18nProvider`. `initReactI18next` is only
 * called from that provider's effect, so `useI18n` throws on anything that runs
 * earlier in the tree.
 */
export const UnlabelledLoaderScreen = () => (
  <div className={ readerLoaderStyles.loader } />
);

export const StatefulLoader = ({ isLoading, children, loader }: StatefulLoaderProps) => {
  return (
    <>
    <ThLoader 
      isLoading={ isLoading } 
      loader={ loader ?? <DefaultLoaderScreen /> } 
      className={ readerLoaderStyles.wrapper } 
    >
      { children }
    </ThLoader>
    </>
  )
}
