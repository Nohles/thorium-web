import { createServerFn } from "@tanstack/react-start";
import { verifyManifestUrlFromEnv } from "@/next-lib/helpers/verifyManifest";

export const verifyManifestUrlOnServer = createServerFn({ method: "GET" })
  .inputValidator((url: string) => url)
  .handler(({ data }: { data: string }) => {
    const manifestUrl = decodeURIComponent(data);
    const result = verifyManifestUrlFromEnv(manifestUrl);

    if (!result.allowed) {
      return {
        ok: false,
        status: result.error === "Invalid URL" ? 400 : 403,
      };
    }

    return {
      ok: true,
      status: 200,
    };
  });

export const isManifestRouteEnabledOnServer = createServerFn({ method: "GET" })
  .handler(() => {
    return process.env.NODE_ENV !== "production" ||
      process.env.MANIFEST_ROUTE_FORCE_ENABLE === "true";
  });
