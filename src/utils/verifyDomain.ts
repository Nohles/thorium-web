import { verifyManifestUrlOnServer } from "@/server/manifest";

export async function verifyManifestUrl(url: string): Promise<boolean> {
  if (!url) return false;

  try {
    const decodedUrl = decodeURIComponent(url);
    const response = await verifyManifestUrlOnServer({ data: decodedUrl });
    return response.ok;
  } catch {
    return false;
  }
}
