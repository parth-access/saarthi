const MAX_RETURN_PATH_LENGTH = 2048;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const DOT_SEGMENT = /(?:^|\/)\.{1,2}(?:\/|$)/;

const ROLE_ROOTS: Readonly<Record<string, readonly string[]>> = {
  client: ['/dashboard'],
  therapist: ['/therapist'],
  admin: ['/admin', '/dashboard'],
};

function isWithinRoot(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

/**
 * Returns a local protected destination when it is safe for the supplied role.
 * The original value is retained so encoded query-string values are not changed.
 */
export function getSafeReturnPath(
  value: string | null | undefined,
  role: string
): string | null {
  if (!value || value.length > MAX_RETURN_PATH_LENGTH) {
    return null;
  }

  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    value.includes('#') ||
    CONTROL_CHARACTERS.test(value)
  ) {
    return null;
  }

  // A malformed escape can be interpreted differently by different URL consumers.
  let decodedValue: string;
  try {
    decodedValue = decodeURIComponent(value);
  } catch {
    return null;
  }

  if (CONTROL_CHARACTERS.test(decodedValue)) {
    return null;
  }

  const queryIndex = value.indexOf('?');
  const pathname = queryIndex === -1 ? value : value.slice(0, queryIndex);

  // Do not accept any encoded pathname: repeated decoding by intermediaries
  // can turn encoded separators or dot segments into a different destination.
  // Encoded query values remain permitted and are kept verbatim.
  if (pathname.includes('%')) {
    return null;
  }

  if (
    pathname.includes('//') ||
    DOT_SEGMENT.test(pathname)
  ) {
    return null;
  }

  const allowedRoots = Object.prototype.hasOwnProperty.call(ROLE_ROOTS, role)
    ? ROLE_ROOTS[role]
    : undefined;
  if (
    !allowedRoots?.some((root) => isWithinRoot(pathname, root))
  ) {
    return null;
  }

  return value;
}

/** Builds the login URL used when a protected request needs authentication. */
export function getLoginRedirectPath(pathname: string, search: string): string {
  const normalizedSearch = search && !search.startsWith('?') ? `?${search}` : search;
  return `/login?next=${encodeURIComponent(`${pathname}${normalizedSearch}`)}`;
}
