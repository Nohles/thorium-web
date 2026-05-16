"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ErrorDisplay } from "@/components/Misc";
import { StatefulReadAlongWrapper } from "@/components/Reader/StatefulReadAlongWrapper";
import { READ_ALONG_PUBLICATIONS } from "@/config/publications";
import { useAppSelector } from "@/lib/hooks";
import { ErrorHandler } from "@/helpers/errorHandler";

function ReadAlongPageContent() {
  const searchParams = useSearchParams();
  const isLoading = useAppSelector((state) => state.reader.isLoading);

  const pairId = searchParams.get("id");
  const epubParam = searchParams.get("epub");
  const audioParam = searchParams.get("audio");
  const guidedParam = searchParams.get("guided");

  const preset = pairId
    ? READ_ALONG_PUBLICATIONS[pairId as keyof typeof READ_ALONG_PUBLICATIONS]
    : undefined;

  const epubUrl = epubParam ?? preset?.epub ?? "";
  const audioUrl = audioParam ?? preset?.audio ?? "";
  const guidedNavigationUrl = guidedParam ?? preset?.guided;

  if (!epubUrl || !audioUrl) {
    return (
      <ErrorDisplay
        error={ ErrorHandler.process(
          new Error("Provide ?epub= and ?audio= manifest URLs, or ?id= for a preset pair."),
          "Validation"
        ) }
      />
    );
  }

  return (
    <StatefulReadAlongWrapper
      epubUrl={ epubUrl }
      audioUrl={ audioUrl }
      guidedNavigationUrl={ guidedNavigationUrl }
      isLoading={ isLoading }
    />
  );
}

export default function ReadAlongPage() {
  return (
    <Suspense fallback={ null }>
      <ReadAlongPageContent />
    </Suspense>
  );
}
