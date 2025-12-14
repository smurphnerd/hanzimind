import { NextRequest, NextResponse } from "next/server";

import { env } from "@/env";

export default function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/_next/") && !pathname.startsWith("/api/")) {
    const s3Endpoint = new URL(env.S3_OPTIONS.endpoint);
    if (!env.S3_OPTIONS.forcePathStyle) {
      s3Endpoint.host = env.S3_OPTIONS.bucketName + "." + s3Endpoint.host;
    }

    const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval';
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data:;
    media-src 'self' ${s3Endpoint.toString()};
    object-src 'none';
    frame-ancestors 'none';
    connect-src 'self' ${s3Endpoint.toString()};
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
