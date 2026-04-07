import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";

import { ThStoreProvider } from "@/lib/ThStoreProvider";
import { ThPreferencesProvider } from "@/preferences/ThPreferencesProvider";
import { ThI18nProvider } from "@/i18n/ThI18nProvider";

import resetCss from "../app/reset.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Thorium Web" },
      {
        name: "description",
        content: "Play with the capabilities of the Readium Web Toolkit",
      },
    ],
    links: [
      { rel: "stylesheet", href: resetCss },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap",
      },
    ],
  }),
  shellComponent: RootDocument,
  errorComponent: RootErrorComponent,
});

function RootDocument() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        <ThStoreProvider>
          <ThPreferencesProvider devMode={process.env.NODE_ENV !== "production"}>
            <ThI18nProvider>
              <Outlet />
            </ThI18nProvider>
          </ThPreferencesProvider>
        </ThStoreProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootErrorComponent() {
  return (
    <main style={{ padding: "1rem" }}>
      <h1>Something went wrong</h1>
      <p>An unexpected error occurred while rendering this route.</p>
    </main>
  );
}
