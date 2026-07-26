import { NextRequest, NextResponse } from "next/server";

import { env } from "@/env";

export default function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/_next/") && !pathname.startsWith("/api/")) {
    const s3Endpoint = new URL(env.S3_OPTIONS.endpoint);
    if (!env.S3_OPTIONS.forcePathStyle) {
      s3Endpoint.host = env.S3_OPTIONS.bucketName + "." + s3Endpoint.host;
    }

    // Audio is fetched from the PUBLIC origin (an R2 r2.dev/custom domain, or a
    // CloudFront distribution), which is a different host from the S3 API
    // endpoint used to upload it. Both have to be allowed or playback is
    // blocked in the browser.
    const mediaOrigins = [s3Endpoint.toString()];
    if (env.S3_OPTIONS.cloudfrontDistributionUrl) {
      mediaOrigins.push(new URL(env.S3_OPTIONS.cloudfrontDistributionUrl).origin);
    }
    const media = mediaOrigins.join(" ");

    const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval';
    style-src 'self' 'unsafe-inline';
    font-src 'self' data:;
    img-src 'self' blob: data:;
    media-src 'self' ${media};
    object-src 'none';
    frame-ancestors 'none';
    connect-src 'self' ${media};
    upgrade-insecure-requests;
  `;
    response.headers.set(
      "Content-Security-Policy",
      cspHeader.replace(/\n/g, ""),
    );
    response.headers.set("Strict-Transport-Security", "max-age=3600");
  }
  return response;
}
