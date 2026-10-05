/**
 * Helper to construct properly encoded Open Graph / Twitter image URLs
 * Prevents issues with unencoded em-dashes and special characters in metadata.
 */
export const ogImage = (title: string, description: string): string => {
  return `/api/og?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`;
};
