export type SecurityHeaderInput = {
  nonce: string;
  isDevelopment: boolean;
  mediaOrigins: readonly string[];
};

export type S3MediaOptions = {
  endpoint: string;
  bucketName: string;
  forcePathStyle?: boolean;
  cloudfrontDistributionUrl?: string;
};

export function mediaOriginsFor(s3: S3MediaOptions): string[] {
  const endpoint = new URL(s3.endpoint);
  if (!s3.forcePathStyle) {
    endpoint.host = `${s3.bucketName}.${endpoint.host}`;
  }
  const origins = [endpoint.origin];
  if (s3.cloudfrontDistributionUrl) {
    origins.push(new URL(s3.cloudfrontDistributionUrl).origin);
  }
  return origins;
}

export function buildContentSecurityPolicy({
  nonce,
  isDevelopment,
  mediaOrigins,
}: SecurityHeaderInput): string {
  const media = mediaOrigins.join(" ");
  const script = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
  ].join(" ");
  return [
    "default-src 'self'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' blob: data:",
    `media-src 'self' ${media}`,
    `connect-src 'self' ${media}`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function buildSecurityHeaders(
  input: SecurityHeaderInput,
): Record<string, string> {
  return {
    "Content-Security-Policy": buildContentSecurityPolicy(input),
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Content-Type-Options": "nosniff",
  };
}

/** Next's own assets: no HTML, so no policy, but they still must not be sniffed. */
export function skipsContentSecurityPolicy(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/static/") || pathname.startsWith("/_next/image")
  );
}
