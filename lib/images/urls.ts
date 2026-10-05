/** Hosts the image proxy may fetch from. Anything else is refused (no open proxy). */
const ALLOWED_HOSTS = ["images.unsplash.com", "images.pexels.com", "pixabay.com", "cdn.pixabay.com"];

export function isAllowedImageUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (u.username || u.password || u.port) return false;
  return ALLOWED_HOSTS.includes(u.hostname);
}

const UNSPLASH_DOWNLOAD = /^https:\/\/api\.unsplash\.com\/photos\/[A-Za-z0-9_-]+\/download(\?[A-Za-z0-9_=&%.-]*)?$/;
export const isUnsplashDownloadLocation = (raw: string) => UNSPLASH_DOWNLOAD.test(raw);

/** Unsplash requires attribution links to carry these referral parameters. */
export function withReferral(url: string): string {
  if (!/unsplash\.com/.test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}utm_source=fred_m_quote_studio&utm_medium=referral`;
}
