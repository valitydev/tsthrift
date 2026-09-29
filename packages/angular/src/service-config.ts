import { type HttpTransportConfig, mergeHeaderProviders } from "@vality/tsthrift";

/** Merges global, token, and provider settings in increasing precedence. */
export function mergeServiceConfig(
  ...layers: (Partial<HttpTransportConfig> | null | undefined)[]
): HttpTransportConfig {
  let result: Partial<HttpTransportConfig> = {};
  for (const layer of layers) {
    if (layer)
      result = {
        ...result,
        ...layer,
        headers: mergeHeaderProviders(result.headers, layer.headers),
      };
  }
  if (
    typeof result.endpoint !== "function" &&
    (typeof result.endpoint !== "string" || !result.endpoint.trim())
  ) {
    throw new TypeError(
      "Provide a Thrift endpoint with provideThriftConfig or service configuration",
    );
  }
  return result as HttpTransportConfig;
}
