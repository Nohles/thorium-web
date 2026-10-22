import { expect, test } from "bun:test";
import { Suspense } from "react";
import { renderToString } from "react-dom/server";

import { ThGlobalPreferencesProvider } from "@/preferences/ThGlobalPreferencesProvider";
import { ThI18nProvider } from "./ThI18nProvider";
import { i18n } from "./config";
import { useI18n } from "./useI18n";

function LoadingLabel() {
  const { t } = useI18n();
  const key = "reader.app.loading";
  const label = t(key);
  return <p>{ label === key ? "Loading" : label }</p>;
}

test("a cold reader renders its loading label before i18n initializes", () => {
  expect(i18n.isInitialized).toBeFalsy();

  const html = renderToString(
    <Suspense fallback={ <p>Suspended reader</p> }>
      <ThGlobalPreferencesProvider>
        <ThI18nProvider>
          <LoadingLabel />
        </ThI18nProvider>
      </ThGlobalPreferencesProvider>
    </Suspense>
  );

  expect(html).toContain("<p>Loading</p>");
  expect(html).not.toContain("Suspended reader");
});
