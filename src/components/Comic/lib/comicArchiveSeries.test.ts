import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { deriveCliChildManifestUrl } from "./comicArchiveSeries";

const parent =
  "https://reader.test/readium/s/webpub/QXN1cmEgU2NhbnMgKEVOKS9DaHJvbmljbGVzIG9mIHRoZSBMYXp5IFNvdmVyZWlnbg/manifest.json";

describe("deriveCliChildManifestUrl", () => {
  test("encodes chapter names outside Latin-1 as UTF-8", () => {
    assert.equal(
      deriveCliChildManifestUrl(parent, "Chapter 70 - “New Waves Overtake the Old.cbz"),
      "https://reader.test/readium/s/webpub/QXN1cmEgU2NhbnMgKEVOKS9DaHJvbmljbGVzIG9mIHRoZSBMYXp5IFNvdmVyZWlnbi9DaGFwdGVyIDcwIC0g4oCcTmV3IFdhdmVzIE92ZXJ0YWtlIHRoZSBPbGQuY2J6/manifest.json"
    );
  });

  test("round-trips a non-ASCII parent folder", () => {
    const token = Buffer.from("漫画/シリーズ", "utf8").toString("base64url");
    const child = deriveCliChildManifestUrl(`https://reader.test/webpub/${token}/manifest.json`, "第1話.cbz");
    const childToken = child?.match(/\/webpub\/([^/]+)\/manifest\.json$/)?.[1];
    assert.equal(Buffer.from(childToken!, "base64url").toString("utf8"), "漫画/シリーズ/第1話.cbz");
  });
});
