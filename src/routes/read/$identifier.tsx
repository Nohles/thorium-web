"use client";

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { StatefulLoader, ErrorDisplay } from "@/components/Misc";
import { PUBLICATION_MANIFESTS } from "@/config/publications";
import { usePublication } from "@/hooks/usePublication";
import { useAppSelector } from "@/lib/hooks";
import { verifyManifestUrl } from "@/utils/verifyDomain";
import { StatefulReaderWrapper } from "@/components/Reader/StatefulReaderWrapper";
import { ErrorHandler, ProcessedError } from "@/helpers/errorHandler";

import "@/app/read/app.css";

export const Route = createFileRoute("/read/$identifier")({
  ssr: false,
  component: BookPage,
});

function BookPage() {
  const { identifier } = Route.useParams();
  const [domainError, setDomainError] = useState<ProcessedError | null>(null);
  const isLoading = useAppSelector((state) => state.reader.isLoading);

  const manifestUrl = identifier
    ? PUBLICATION_MANIFESTS[identifier as keyof typeof PUBLICATION_MANIFESTS] || identifier
    : "";

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
      console.error("Publication loading error:", error);
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
