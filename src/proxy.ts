import { NextRequest, NextResponse } from "next/server";

import { env } from "@/env";
import {
  buildSecurityHeaders,
  mediaOriginsFor,
  skipsContentSecurityPolicy,
} from "@/server/csp";

export default function proxy(request: NextRequest) {
  if (skipsContentSecurityPolicy(request.nextUrl.pathname)) {
    const response = NextResponse.next();
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  }

  const nonce = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))),
  );
  const securityHeaders = buildSecurityHeaders({
    nonce,
    isDevelopment: env.NODE_ENV === "development",
    mediaOrigins: mediaOriginsFor(env.S3_OPTIONS),
  });

  // Next reads the nonce from the request's own CSP header and stamps it on
  // every inline script it emits.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(
    "Content-Security-Policy",
    securityHeaders["Content-Security-Policy"],
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of Object.entries(securityHeaders)) {
    response.headers.set(name, value);
  }
  return response;
}
