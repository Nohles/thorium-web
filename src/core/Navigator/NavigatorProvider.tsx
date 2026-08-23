import { createContext, useMemo } from "react";
import { useEpubNavigator } from "../Hooks/Epub/useEpubNavigator";
import { useWebPubNavigator } from "../Hooks/WebPub/useWebPubNavigator";
import { useAudioNavigator } from "../Hooks/Audio/useAudioNavigator";
import { useComicNavigator } from "../Hooks/Comic/useComicNavigator";
import type { Publication } from "@readium/shared";

type VisualNavigator =
  | ReturnType<typeof useEpubNavigator>
  | ReturnType<typeof useWebPubNavigator>
  | ReturnType<typeof useComicNavigator>;
type MediaNavigator = ReturnType<typeof useAudioNavigator>;

interface NavigatorContextValue {
  media?: MediaNavigator;
  visual?: VisualNavigator;
  publication?: Publication;
}

export const NavigatorContext = createContext<NavigatorContextValue | null>(null);

export const NavigatorProvider = ({ 
  mediaNavigator, 
  visualNavigator, 
  publication,
  children 
}: { 
  mediaNavigator?: MediaNavigator;
  visualNavigator?: VisualNavigator;
  publication?: Publication;
  children: React.ReactNode 
}) => {
  const value = useMemo(
    () => ({ media: mediaNavigator, visual: visualNavigator, publication }),
    [mediaNavigator, publication, visualNavigator],
  );

  return (
    <NavigatorContext.Provider value={value}>
      { children }
    </NavigatorContext.Provider>
  );
};
