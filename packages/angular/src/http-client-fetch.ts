export interface AngularHttpClientLike {
  request(
    method: string,
    url: string,
    options: {
      body?: any;
      headers?: Record<string, string>;
      responseType: "arraybuffer";
      observe: "response";
    },
  ): any;
}

/**
 * Adapts an Angular HttpClient instance to standard fetch API for Thrift transports.
 */
export function createHttpClientFetch(httpClient: AngularHttpClientLike): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    const headersRecord: Record<string, string> = {};
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => {
        headersRecord[key] = value;
      });
    }

    const response$ = httpClient.request("POST", url, {
      body: init?.body,
      headers: headersRecord,
      responseType: "arraybuffer",
      observe: "response",
    });

    if (init?.signal?.aborted) {
      throw init.signal.reason ?? new DOMException("The operation was aborted", "AbortError");
    }

    return new Promise<Response>((resolve, reject) => {
      const sub = response$.subscribe({
        next: (res: any) => {
          const responseHeaders = new Headers();
          if (res.headers && typeof res.headers.keys === "function") {
            for (const key of res.headers.keys()) {
              const val = res.headers.get(key);
              if (val) responseHeaders.set(key, val);
            }
          }
          resolve(
            new Response(res.body ?? new Uint8Array(), {
              status: res.status,
              statusText: res.statusText,
              headers: responseHeaders,
            }),
          );
        },
        error: (err: unknown) => reject(err),
      });

      if (init?.signal) {
        init.signal.addEventListener(
          "abort",
          () => {
            sub.unsubscribe();
            reject(
              init.signal?.reason ?? new DOMException("The operation was aborted", "AbortError"),
            );
          },
          { once: true },
        );
      }
    });
  };
}
