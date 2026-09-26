import { firstValueFrom } from "rxjs";

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

    const res = (await firstValueFrom(response$)) as {
      status: number;
      statusText: string;
      body: ArrayBuffer | null;
      headers: { keys(): string[]; get(key: string): string | null };
    };

    const responseHeaders = new Headers();
    if (res.headers && typeof res.headers.keys === "function") {
      for (const key of res.headers.keys()) {
        const val = res.headers.get(key);
        if (val) responseHeaders.set(key, val);
      }
    }

    return new Response(res.body ?? new Uint8Array(), {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  };
}
