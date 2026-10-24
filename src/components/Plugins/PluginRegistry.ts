import { ThSettingsEntry } from "@/core/Components";
import { StatefulActionsMapObject } from "../Actions";

export enum ThPluginType {
  ACTION = "action",
  SETTING = "setting",
}

export type ActionComponent = StatefulActionsMapObject;

export interface SettingComponent extends ThSettingsEntry {
  type?: "text" | "spacing";
  props?: any;
}

export interface ThPlugin {
  id: string;
  name: string;
  description?: string;
  version?: string;
  components: {
    actions?: Record<string, ActionComponent>;
    settings?: Record<string, SettingComponent>;
    primaryAudioActions?: Record<string, ActionComponent>;
  };
}

export class PluginRegistryClass {
  private pluginsStore: ThPlugin[] = [];
  register(plugin: ThPlugin): void {
    const existingPluginIndex = this.pluginsStore.findIndex(p => p.id === plugin.id);
    
    if (existingPluginIndex >= 0) {
      this.pluginsStore[existingPluginIndex] = plugin;
    } else {
      this.pluginsStore.push(plugin);
    }
  }
  
  unregister(pluginId: string): void {
    const filteredPlugins = this.pluginsStore.filter(plugin => plugin.id !== pluginId);
    
    // Clear the array and repopulate it
    this.pluginsStore.length = 0;
    this.pluginsStore.push(...filteredPlugins);
  }
  
  getPlugins(): ThPlugin[] {
    return [...this.pluginsStore];
  }
  
  getComponentMaps() {
    const actionsComponentsMap: Record<string, ActionComponent> = {} as Record<string, ActionComponent>;
    const settingsComponentsMap: Record<string, SettingComponent> = {} as Record<string, SettingComponent>;
    const primaryAudioActionsMap: Record<string, ActionComponent> = {} as Record<string, ActionComponent>;

    // Later plugins override earlier defaults.
    this.pluginsStore.forEach(plugin => {
      // Merge actions components
      if (plugin.components.actions) {
        Object.entries(plugin.components.actions).forEach(([key, component]) => {
          actionsComponentsMap[key as string] = component;
        });
      }

      // Merge settings components
      if (plugin.components.settings) {
        Object.entries(plugin.components.settings).forEach(([key, component]) => {
          settingsComponentsMap[key as string] = component;
        });
      }

      // Merge primary audio action components
      if (plugin.components.primaryAudioActions) {
        Object.entries(plugin.components.primaryAudioActions).forEach(([key, component]) => {
          primaryAudioActionsMap[key as string] = component;
        });
      }
    });

    return {
      actionsComponentsMap,
      settingsComponentsMap,
      primaryAudioActionsMap
    };
  }
}

// Export singleton instance
export const ThPluginRegistry = new PluginRegistryClass();