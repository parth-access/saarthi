import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Retired public/ images and their optimized replacements. */
const LEGACY_IMAGES: Record<string, string> = {
  "/dravina.png": "/dravina.webp",
  "/about_page.png": "/dravina.webp",
  "/vision_page.png": "/vision_page.webp",
  "/home_page.jpeg": "/home_page.webp",
};

export function normalizeImageUrl(src: string | undefined): string {
  if (!src) return "/dravina.webp";
  if (LEGACY_IMAGES[src]) return LEGACY_IMAGES[src];
  if (src.startsWith("http://") || src.startsWith("https://")) {
    return src;
  }
  if (src.startsWith("/")) {
    return src;
  }
  return `/${src}`;
}

export const toDateSafe = (
  value: unknown 
): Date | null => {
  if (!value) return null;

  if (typeof value === "string") {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate();
  }

  if (typeof value === "object" && value !== null && "seconds" in value && typeof (value as { seconds: number }).seconds === "number") {
    return new Date((value as { seconds: number }).seconds * 1000);
  }

  return null;
};
