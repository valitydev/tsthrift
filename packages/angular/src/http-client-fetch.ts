import { firstValueFrom, fromEvent, mergeMap, takeUntil, throwError } from "rxjs";

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

function toResponse(res: any, body: BodyInit | null): Response {
  const headers = new Headers();
  for (const key of res.headers?.keys() ?? []) {
    const value = res.headers.get(key);
    if (value !== null) headers.set(key, value);
  }
  return new Response([204, 205, 304].includes(res.status) ? null : body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

/** Adapts Angular HTTP binary requests, cancellation, and backend errors to fetch semantics. */
export function createHttpClientFetch(httpClient: AngularHttpClientLike): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    request.signal.throwIfAborted();
    // Angular serializes typed arrays as JSON; ArrayBuffer is its raw binary body type.
    const body = request.body ? await request.arrayBuffer() : undefined;
    request.signal.throwIfAborted();
    const response$ = httpClient.request(request.method, request.url, {
      body,
      headers: Object.fromEntries(request.headers),
      responseType: "arraybuffer",
      observe: "response",
    });
    const abort$ = fromEvent(request.signal, "abort").pipe(
      mergeMap(() => throwError(() => request.signal.reason)),
    );
    try {
      const response = await firstValueFrom<any>(response$.pipe(takeUntil(abort$)));
      return toResponse(response, response.body ?? null);
    } catch (error: any) {
      if (request.signal.aborted) throw request.signal.reason;
      if (error?.status >= 200 && error.status <= 599) {
        return toResponse(error, error.error ?? null);
      }
      throw error;
    }
  };
}
