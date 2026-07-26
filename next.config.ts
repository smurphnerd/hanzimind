import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // transformers.js pulls in the native ONNX runtime, which has to stay a real
  // Node require on the server rather than being bundled.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
};

export default nextConfig;
