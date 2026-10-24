"use client";

import React, { createContext, useContext, useMemo, useReducer } from "react";
import { ThPluginRegistry, PluginRegistryClass, ThPlugin, ActionComponent, SettingComponent } from "./PluginRegistry";

interface ThPluginContextType {
  actionsComponentsMap: Record<string, ActionComponent>;
  settingsComponentsMap: Record<string, SettingComponent>;
  textSettingsComponentsMap: Record<string, SettingComponent>;
  spacingSettingsComponentsMap: Record<string, SettingComponent>;
  primaryAudioActionsMap: Record<string, ActionComponent>;
  registerPlugin: typeof ThPluginRegistry.register;
  unregisterPlugin: typeof ThPluginRegistry.unregister;
}

const ThPluginContext = createContext<ThPluginContextType>({
  actionsComponentsMap: {} as Record<string, ActionComponent>,
  settingsComponentsMap: {} as Record<string, SettingComponent>,
  textSettingsComponentsMap: {} as Record<string, SettingComponent>,
  spacingSettingsComponentsMap: {} as Record<string, SettingComponent>,
  primaryAudioActionsMap: {} as Record<string, ActionComponent>,
  registerPlugin: ThPluginRegistry.register.bind(ThPluginRegistry),
  unregisterPlugin: ThPluginRegistry.unregister.bind(ThPluginRegistry)
});

export const usePlugins = () => useContext(ThPluginContext);

/** Explicit plugins belong to this reader; omitted plugins retain the legacy registry API. */
export const ThPluginProvider = ({ children, plugins }: { children: React.ReactNode; plugins?: ThPlugin[] }) => {
  const [revision, refresh] = useReducer((value: number) => value + 1, 0);
  const registry = useMemo(() => {
    if (plugins === undefined) return ThPluginRegistry;
    const scoped = new PluginRegistryClass();
    plugins.forEach(plugin => scoped.register(plugin));
    return scoped;
  }, [plugins]);

  const value = useMemo(() => {
    const maps = registry.getComponentMaps();
    const typedSettings = (type: "text" | "spacing") => Object.fromEntries(
      Object.entries(maps.settingsComponentsMap).filter(([, component]) => component.type === type)
    );
    return {
      ...maps,
      textSettingsComponentsMap: typedSettings("text"),
      spacingSettingsComponentsMap: typedSettings("spacing"),
      registerPlugin: (plugin: ThPlugin) => {
        registry.register(plugin);
        refresh();
      },
      unregisterPlugin: (pluginId: string) => {
        registry.unregister(pluginId);
        refresh();
      },
    };
  }, [registry, revision]);

  return <ThPluginContext.Provider value={value}>{children}</ThPluginContext.Provider>;
};
