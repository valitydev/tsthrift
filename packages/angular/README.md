# @vality/tsthrift-angular

Angular dependency injection providers, service tokens, and RxJS Observable adapters for `@vality/tsthrift`.

`@vality/tsthrift-angular` integrates generated Thrift services with Angular applications, providing declarative dependency injection, cold RxJS Observables with automatic cancellation, and an adapter for Angular's `HttpClient`.

## Features

- **Angular Dependency Injection:** Register and inject Thrift service clients using standalone providers (`provideThriftConfig`, `provideThriftServices`, `provideThriftService`).
- **Service modes:** Create a Promise service with `createPromiseService` or a cold Observable service with `createObservableService`.
- **Automatic cancellation:** Unsubscribing from an Observable immediately aborts the in-flight HTTP request via `AbortSignal`.
- **Angular `HttpClient` bridge:** Use `createHttpClientFetch` to route Thrift binary requests through Angular's `HttpClient`, keeping existing interceptors (auth, logging, CSRF) active.
- **Typed service injection tokens:** Stable tokens generated per service descriptor (`getServiceToken`), typed as `ObservableClient<TService>`.
- **Result mapping:** Seamless transformation into `{ data, error }` results via the `catchThriftResult()` RxJS operator.

## Installation

```sh
npm install @vality/tsthrift-angular rxjs
# or
pnpm add @vality/tsthrift-angular rxjs
```

The core runtime is installed transitively; installing `@vality/tsthrift` separately
is only needed when the application imports its API directly.

### Peer Dependencies

- `@angular/core` (`>= 22.0.0`)
- `rxjs` (`>= 7.0.0`)

## Quick Start

### 1. Configure providers in `app.config.ts`

Import `provideThriftConfig` and `provideThriftServices` in your standalone application bootstrap config:

```ts
import { ApplicationConfig } from "@angular/core";
import { provideHttpClient } from "@angular/common/http";
import { createWoodyHeaders } from "@vality/tsthrift";
import { provideThriftConfig, provideThriftServices } from "@vality/tsthrift-angular";
import { THRIFT_SERVICES_LIST } from "./generated/services.js";

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideThriftConfig({
      endpoint: "/api/rpc",
      timeoutMs: 15_000,
      headers: () => createWoodyHeaders(), // enables distributed tracing headers
    }),
    provideThriftServices(THRIFT_SERVICES_LIST),
  ],
};
```

### 2. Inject and use clients in components or services

Use `inject` with `getServiceToken` and the service descriptor from generated `THRIFT_SERVICES`:

```ts
import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { getServiceToken } from "@vality/tsthrift-angular";
import { THRIFT_SERVICES } from "./generated/services.js";

@Component({
  selector: "app-payment-details",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="payment$ | async as payment">
      <h3>Payment ID: {{ payment.id }}</h3>
      <p>Status: {{ payment.status }}</p>
    </div>
  `,
})
export class PaymentDetailsComponent {
  private paymentService = inject(
    getServiceToken(THRIFT_SERVICES["payment_processing.PaymentProcessing"]),
  );

  // Calling service methods returns cold Observables
  payment$ = this.paymentService.getPayment(1001n);
}
```

## Creating Self-Providing Observable Services (`createObservableService`)

For the cleanest developer experience, you can create service tokens directly in your application's API layer with their unique endpoint and configuration:

```ts
// src/app/api/payment.ts
import { createObservableService } from "@vality/tsthrift-angular";
import { PaymentProcessing } from "./generated/payment_processing/index.js";

// Self-provides in the root injector with a unique endpoint:
export const PaymentProcessingService = createObservableService(PaymentProcessing, {
  endpoint: "https://payments.example.com/rpc",
  timeoutMs: 15_000,
});
```

Then inject it directly in components without needing any boilerplate in `app.config.ts`:

```ts
import { Component, inject } from "@angular/core";
import { PaymentProcessingService } from "./api/payment.js";

@Component({ ... })
export class CheckoutComponent {
  private paymentService = inject(PaymentProcessingService);

  // Cold Observable by default:
  payment$ = this.paymentService.getPayment(1001n);
}
```

For async/await, create a Promise service instead:

```ts
import { inject } from "@angular/core";
import { createPromiseService } from "@vality/tsthrift-angular";
import { PaymentProcessing } from "./generated/payment_processing/index.js";

export const PaymentProcessingPromiseService = createPromiseService(PaymentProcessing, {
  endpoint: "https://payments.example.com/rpc",
});

export class CheckoutService {
  private paymentService = inject(PaymentProcessingPromiseService);

  async loadPayment() {
    return await this.paymentService.getPayment(1001n);
  }
}
```

Both token types work with `provideThriftService` and `provideThriftServices`.
They can coexist for the same descriptor and keep independent configuration.
Passing a raw descriptor to providers continues to select Observable methods.
Outside Angular DI, generated `create<Service>(config)` factories return Promise clients.

Any global settings from `provideThriftConfig` (e.g. auth headers, Woody tracing) are automatically resolved and merged with the service's configuration.

## Advanced Usage

### Using Angular `HttpClient` with Interceptors

By default, `@vality/tsthrift` uses the global `fetch`. To route requests through Angular's HTTP pipeline (including Angular HTTP interceptors for auth tokens, telemetry, etc.), bridge `HttpClient` using `createHttpClientFetch`:

```ts
import { inject } from "@angular/core";
import { HttpClient, provideHttpClient } from "@angular/common/http";
import { createHttpClientFetch, provideThriftConfig } from "@vality/tsthrift-angular";

export const providers = [
  provideHttpClient(),
  provideThriftConfig(() => ({
    endpoint: "/api/rpc",
    fetch: createHttpClientFetch(inject(HttpClient)),
  })),
];
```

### Per-Service Configuration Overrides

Override configuration (such as distinct endpoints, headers, or timeouts) for an individual service:

```ts
import { provideThriftService } from "@vality/tsthrift-angular";
import { THRIFT_SERVICES } from "./generated/services.js";

export const appConfig: ApplicationConfig = {
  providers: [
    provideThriftConfig({ endpoint: "/api/rpc" }),
    // Specific service with a dedicated endpoint and timeout
    provideThriftService(THRIFT_SERVICES["reporting.Analytics"], {
      endpoint: "/analytics/rpc",
      timeoutMs: 60_000,
    }),
  ],
};
```

### Manual Call Wrapping (`deferThriftCall`)

Wrap any Promise-returning Thrift call into a cold RxJS Observable with lifecycle management and cancellation:

```ts
import { deferThriftCall } from "@vality/tsthrift-angular";

const observable$ = deferThriftCall((options) => client.calculate(param, options));
```

### Error Handling in Observables

`catchThriftResult()` captures the same error wrappers thrown by Promise clients.
Use `catchThriftError` to handle declared exceptions by qualified
`module.Exception` name. The original payload is available as `error.data`.
Recovery values are included in the resulting Observable type:

```ts
import { of } from "rxjs";
import { catchThriftError } from "@vality/tsthrift-angular";

// 1. Catch specific declared error by name with auto-rethrow of other errors:
this.paymentService.getPayment(id).pipe(
  catchThriftError("payment_processing.PaymentNotFound", (err) => {
    console.warn("Payment missing:", err.data);
    return of(null);
  }),
);

// 2. Pattern-match multiple declared errors via dictionary:
this.paymentService.getPayment(id).pipe(
  catchThriftError({
    "payment_processing.PaymentNotFound": (err) => of(null),
    LimitExceeded: (err) => of({ status: "blocked" }),
  }),
);
```

Or inspect all errors manually with standard RxJS `catchError` and `@vality/tsthrift` guards:

```ts
import { catchError, of } from "rxjs";
import { isThriftServiceError, isThriftSystemError } from "@vality/tsthrift";

this.paymentService.getPayment(id).pipe(
  catchError((err) => {
    if (isThriftServiceError(err, "payment_processing.PaymentNotFound")) {
      console.warn("Payment was not found:", err.data);
      return of(null);
    }
    if (isThriftSystemError(err)) {
      console.error("Network or protocol error:", err.message);
    }
    throw err;
  }),
);
```

## API Reference

### DI Providers & Tokens

- `createPromiseService(descriptor, config?): PromiseServiceToken<TClient>`: Creates an injectable token whose methods return Promises.
- `createObservableService(descriptor, config?): ObservableServiceToken<TClient>`: Creates an injectable token self-providing the observable client in DI with optional unique per-service configuration.
- `provideThriftConfig(config: HttpTransportConfig | (() => HttpTransportConfig)): Provider`: Configures global Thrift settings.
- `provideThriftServices(...serviceLists): EnvironmentProviders`: Registers all generated service descriptors or tokens into Angular DI.
- `provideThriftService(target, config?): Provider`: Registers a single service descriptor or token with optional overrides.
- `getServiceToken(descriptor)`: Returns the `InjectionToken<ObservableClient<TService>>` for the given service descriptor.
- `THRIFT_CONFIG`: Injection token for the global `HttpTransportConfig`.
- `THRIFT_SERVICES_REGISTRY`: Injection token for `Map<string, ThriftServiceDescriptor>`.

### RxJS & HTTP Utilities

- `deferThriftCall(callFactory)`: Wraps a Promise Thrift call into a cold Observable.
- `catchThriftError(name, handler)` / `catchThriftError(handlers)`: Declarative typed error catching operator with automatic type inference and auto-rethrow (aliased as `catchTypedError`).
- `catchThriftResult()`: RxJS operator to catch errors and map emissions into `{ data, error }` `ThriftResult` streams.
- `unwrapThriftResult()`: RxJS operator to unwrap `ThriftResult` streams.
- `createHttpClientFetch(httpClient)`: Bridges an Angular `HttpClient` instance to the Web `fetch` interface.

## License

Apache-2.0

## Adapter contracts

Generated clients carry IDL argument counts used internally by Observable services.
Service creation selects the return type; Observable services do not expose a Promise-client property.
Argument payload keys are never interpreted as request options. `deferThriftCall`
preserves return values, including structs named `data`/`error`; use `.pipe(unwrapThriftResult())`
when explicitly wrapping a Result call. Registry keys are qualified as `module.Service`.
Root-provided tokens use root configuration; use `provideThriftService` in a child
injector for scoped overrides.

Angular SSR is not an accepted integration target in this release. Relative URLs in
the HttpClient-to-fetch adapter require a browser environment. Server-side callers
must provide absolute URLs and own pending-task integration. Use Angular 22 or newer
with its supported TypeScript compiler and `node16`, `nodenext`, or `bundler` resolution;
legacy `node` resolution is unsupported.
