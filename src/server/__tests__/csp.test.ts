import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  mediaOriginsFor,
  skipsContentSecurityPolicy,
} from "../csp";

const lane = {
  nonce: "abc123",
  isDevelopment: false,
  mediaOrigins: ["http://localhost:19099"],
};

describe("buildContentSecurityPolicy", () => {
  it("has no unsafe-eval and no unsafe-inline scripts in production", () => {
    const csp = buildContentSecurityPolicy(lane);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toMatch(
      /script-src 'self' 'nonce-abc123' 'strict-dynamic'(;|$)/,
    );
  });

  it("keeps unsafe-eval only in development", () => {
    const csp = buildContentSecurityPolicy({ ...lane, isDevelopment: true });
    expect(csp).toContain(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic' 'unsafe-eval'",
    );
  });

  it("includes the S3 endpoint in media-src and connect-src", () => {
    const csp = buildContentSecurityPolicy(lane);
    expect(csp).toContain("media-src 'self' http://localhost:19099");
    expect(csp).toContain("connect-src 'self' http://localhost:19099");
  });

  it("locks base-uri, form-action, worker-src, object-src and frame-ancestors", () => {
    const csp = buildContentSecurityPolicy(lane);
    for (const directive of [
      "base-uri 'self'",
      "form-action 'self'",
      "worker-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ]) {
      expect(csp).toContain(directive);
    }
  });
});

describe("buildSecurityHeaders", () => {
  it("is pure: the same input gives the same headers", () => {
    expect(buildSecurityHeaders(lane)).toEqual(
      buildSecurityHeaders({ ...lane }),
    );
  });

  it("sets a one-year HSTS with subdomains, nosniff, referrer and permissions policies", () => {
    expect(buildSecurityHeaders(lane)).toMatchObject({
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
  });
});

describe("mediaOriginsFor", () => {
  it("uses the endpoint origin as is with path-style addressing", () => {
    expect(
      mediaOriginsFor({
        endpoint: "http://localhost:19099",
        bucketName: "default-bucket",
        forcePathStyle: true,
      }),
    ).toEqual(["http://localhost:19099"]);
  });

  it("prefixes the bucket as a virtual host and adds the CloudFront origin", () => {
    expect(
      mediaOriginsFor({
        endpoint: "https://s3.example.com",
        bucketName: "audio",
        cloudfrontDistributionUrl: "https://cdn.example.com/x",
      }),
    ).toEqual(["https://audio.s3.example.com", "https://cdn.example.com"]);
  });
});

describe("skipsContentSecurityPolicy", () => {
  it("skips only Next's static assets, never pages or the API", () => {
    expect(skipsContentSecurityPolicy("/_next/static/chunks/app.js")).toBe(
      true,
    );
    expect(skipsContentSecurityPolicy("/_next/image?url=x")).toBe(true);
    expect(skipsContentSecurityPolicy("/api/rpc/ping")).toBe(false);
    expect(skipsContentSecurityPolicy("/")).toBe(false);
    expect(skipsContentSecurityPolicy("/_global-error")).toBe(false);
    expect(skipsContentSecurityPolicy("/_not-found")).toBe(false);
  });
});
