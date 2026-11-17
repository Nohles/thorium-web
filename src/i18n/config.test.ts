import { expect, spyOn, test } from "bun:test";
import { i18n, initI18n } from "./config";
import type { TFunction } from "i18next";

const translate = ((key: string) => key) as TFunction;

test("concurrent cold starts share one initialization", async () => {
    const wasInitialized = i18n.isInitialized;
    i18n.isInitialized = false;
    let finish: (value: TFunction) => void = () => {};
    const gate = new Promise<TFunction>(resolve => { finish = resolve; });
    const init = spyOn(i18n, "init").mockImplementation(() => gate);
    const first = initI18n({ lng: "en" });
    const second = initI18n({ lng: "en" });
    try { expect(init).toHaveBeenCalledTimes(1); }
    finally {
        finish(translate);
        await Promise.all([first, second]);
        init.mockRestore();
        i18n.isInitialized = wasInitialized;
    }
});

test("a failed initialization can be retried", async () => {
    const wasInitialized = i18n.isInitialized;
    i18n.isInitialized = false;
    let calls = 0;
    const init = spyOn(i18n, "init").mockImplementation(() => ++calls === 1
        ? Promise.reject(new Error("fixture initialization failure")) : Promise.resolve(translate));
    try {
        await expect(initI18n()).rejects.toThrow("fixture initialization failure");
        await initI18n();
        expect(init).toHaveBeenCalledTimes(2);
    } finally { init.mockRestore(); i18n.isInitialized = wasInitialized; }
});
