import { afterEach, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { useAudioPreferences } from "@/preferences/hooks/useAudioPreferences";
import { ThPluginProvider, usePlugins } from "./PluginProvider";
import { ThPluginRegistry, type ThPlugin } from "./PluginRegistry";
import { createDefaultPlugin } from "./helpers/createDefaultPlugin";
import { createAudioDefaultPlugin } from "./helpers/createAudioDefaultPlugin";

function AudioSettings() {
  useAudioPreferences();
  return <p>Audio settings</p>;
}
function VisualSettings() {
  return <p>Comic settings</p>;
}
const audio: ThPlugin = {
  id: "audio-core",
  name: "Audio",
  components: { actions: { settings: { Target: AudioSettings } } },
};
const comic: ThPlugin = {
  id: "core",
  name: "Comic",
  components: { actions: { settings: { Target: VisualSettings } } },
};
function Settings() {
  const Target = usePlugins().actionsComponentsMap.settings.Target!;
  return <Target />;
}
afterEach(() => {
  for (const plugin of ThPluginRegistry.getPlugins()) ThPluginRegistry.unregister(plugin.id);
});

test("comic settings do not inherit audio controls from an earlier reader", () => {
  // The audio reader previously populated the legacy module-level registry.
  ThPluginRegistry.register(audio);
  ThPluginRegistry.register(comic);
  expect(renderToString(
    <ThPluginProvider plugins={[comic]}><Settings /></ThPluginProvider>,
  )).toContain("Comic settings");
});

test("concurrent reader providers keep their own controls and custom overrides", () => {
  const custom: ThPlugin = {
    id: "custom", name: "Custom",
    components: { actions: { settings: { Target: () => <p>Custom settings</p> } } },
  };
  expect(renderToString(
    <>
      <ThPluginProvider plugins={[comic, custom]}><Settings /></ThPluginProvider>
      <ThPluginProvider plugins={[comic]}><Settings /></ThPluginProvider>
    </>,
  )).toBe("<p>Custom settings</p><p>Comic settings</p>");
});

test("real audio and comic plugin factories resolve only their own settings", () => {
  const audioPlugin = createAudioDefaultPlugin();
  const comicPlugin = createDefaultPlugin();
  ThPluginRegistry.register(audioPlugin);
  function VerifySettings({ plugin }: { plugin: ThPlugin }) {
    expect(usePlugins().actionsComponentsMap.settings.Target).toBe(plugin.components.actions!.settings.Target);
    return <p>{plugin.id}</p>;
  }
  expect(renderToString(
    <>
      <ThPluginProvider plugins={[comicPlugin]}><VerifySettings plugin={comicPlugin} /></ThPluginProvider>
      <ThPluginProvider plugins={[audioPlugin]}><VerifySettings plugin={audioPlugin} /></ThPluginProvider>
    </>,
  )).toBe("<p>core</p><p>audio-core</p>");
});
