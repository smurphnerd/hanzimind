/**
 * Where to send a visitor after they sign in.
 *
 * Three things have to hold at once, and string concatenation gave none of them
 * for free.
 *
 * The parameter is a path on our own origin and never a URL of its own, so
 * `//evil.test` and `https://evil.test` land under us as paths. Stripping the
 * leading slashes to none and letting `URL` add exactly one is what stopped
 * `/dictionary/人` composing a `//dictionary/人` host-relative callback aimed at
 * a host called "dictionary".
 *
 * And `URL` percent-encodes the path, which the header this ends up in requires.
 * better-auth writes the callback into `location`, an HTTP header is a
 * ByteString, and a raw non-ASCII path made sign-in answer 500 with no session
 * and an empty body. Already-encoded input passes through unchanged, so the
 * report dialog's `encodeURIComponent` is not doubled.
 */
export function safeCallbackUrl(
  baseUrl: string,
  redirectUrl: string | null,
): string {
  if (!redirectUrl) return "/";
  return new URL(`/${redirectUrl.replace(/^\/+/, "")}`, baseUrl).toString();
}

/**
 * Whether a nav link points at the page being shown. Prefix rather than
 * equality, so /admin/vocab marks Admin and /dictionary/人 marks Dictionary.
 */
export function isCurrentPage(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
