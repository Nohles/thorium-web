"use client";

import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { StatefulLoader, ErrorDisplay } from "@/components/Misc";
import { usePublication } from "@/hooks/usePublication";
import { useAppSelector } from "@/lib/hooks";
import { verifyManifestUrl } from "@/utils/verifyDomain";
import { StatefulReaderWrapper } from "@/components/Reader/StatefulReaderWrapper";
import { ErrorHandler, ProcessedError } from "@/helpers/errorHandler";
import { isManifestRouteEnabledOnServer } from "@/server/manifest";

import "@/app/read/app.css";

export const Route = createFileRoute("/read/manifest/$manifest")({
  ssr: false,
  beforeLoad: async () => {
    const enabled = await isManifestRouteEnabledOnServer();
    if (!enabled) {
      throw redirect({ to: "/" });
    }
  },
  component: ManifestPage,
});

function ManifestPage() {
  const { manifest } = Route.useParams();
  const [domainError, setDomainError] = useState<ProcessedError | null>(null);
  const isLoading = useAppSelector((state) => state.reader.isLoading);
  const manifestUrl = manifest;

  useEffect(() => {
    if (manifestUrl) {
      verifyManifestUrl(manifestUrl).then((allowed) => {
        if (!allowed) {
          const processedDomainError = ErrorHandler.process(new Error("Domain not allowed"), "Domain Validation");
          setDomainError(processedDomainError);
        }
      });
    }
  }, [manifestUrl]);

  const { isLoading: publicationLoading, error, publication, profile, localDataKey } = usePublication({
    url: manifestUrl,
    onError: (error) => {
      console.error("Manifest loading error:", error);
    },
  });

  if (domainError) {
    return <ErrorDisplay error={domainError} />;
  }

  return error ? (
    <ErrorDisplay error={error} />
  ) : (
    <StatefulLoader isLoading={isLoading || publicationLoading}>
      {publication && (
        <StatefulReaderWrapper profile={profile} publication={publication} localDataKey={localDataKey} />
      )}
    </StatefulLoader>
  );
}
