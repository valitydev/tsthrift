# @vality/tsthrift-angular

Angular dependency injection providers, service tokens, and RxJS Observable adapters for `@vality/tsthrift`.

`@vality/tsthrift-angular` integrates generated Thrift services with Angular applications, providing declarative dependency injection, cold RxJS Observables with automatic cancellation, and an adapter for Angular's `HttpClient`.

## Features

- **Angular Dependency Injection:** Register and inject Thrift service clients using standalone providers (`provideThriftConfig`, `provideThriftServices`, `provideThriftService`).
- **RxJS Observable clients:** Automatically converts Promise-based client methods into cold RxJS Observables via `toObservableClient`.
- **Automatic cancellation:** Unsubscribing from an Observable immediately aborts the in-flight HTTP request via `AbortSignal`.
- **Angular `HttpClient` bridge:** Use `createHttpClientFetch` to route Thrift binary requests through Angular's `HttpClient`, keeping existing interceptors (auth, logging, CSRF) active.
- **Typed service injection tokens:** Stable tokens generated per service descriptor (`getServiceToken`), typed as `ObservableClient<TService>`.
- **Safe call handling:** Seamless support for `.safe` sub-clients in Observables for non-throwing error handling.

## Installation

```sh
npm install @vality/tsthrift @vality/tsthrift-angular rxjs
# or
pnpm add @vality/tsthrift @vality/tsthrift-angular rxjs
```

### Peer Dependencies

- `@angular/core` (`>= 16.0.0`)
- `rxjs` (`>= 7.0.0`)

## Quick Start

### 1. Configure providers in `app.config.ts`

Import `provideThriftConfig` and `provideThriftServices` in your standalone application bootstrap config:

```ts
import { ApplicationConfig } from "@angular/core";
import { provideHttpClient } from "@angular/common/http";
import { provideThriftConfig, provideThriftServices } from "@vality/tsthrift-angular";
import { SERVICES_LIST } from "./generated/services/services.js";

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideThriftConfig({
      endpoint: "/api/rpc",
      timeoutMs: 15_000,
      woody: true, // enables distributed tracing headers
    }),
    provideThriftServices(SERVICES_LIST),
  ],
};
```

### 2. Inject and use clients in components or services

Use `inject` with `getServiceToken` and the service descriptor from generated `SERVICES`:

```ts
import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { getServiceToken } from "@vality/tsthrift-angular";
import { SERVICES } from "./generated/services/services.js";

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
export class PaymentDetailsComponent implements OnInit {
  private paymentService = inject(
    getServiceToken(SERVICES["payment_processing.PaymentProcessing"]),
  );

  // Calling service methods returns cold Observables
  payment$ = this.paymentService.getPayment(1001n);

  // Direct access to the underlying Promise client for async/await or Signals
  async loadPayment() {
    const payment = await this.paymentService.promise.getPayment(1001n);
  }
}
```

## Creating Self-Providing Observable Services (`createObservableService`)

For the cleanest developer experience, you can create service tokens directly in your application's API layer with their unique endpoint and configuration:

```ts
// src/app/api/payment.ts
import { createObservableService } from "@vality/tsthrift-angular";
import { PaymentProcessingDescriptor } from "./generated/payment_processing.js";

// Self-provides in "any" injector with a unique endpoint:
export const PaymentProcessing = createObservableService(PaymentProcessingDescriptor, {
  endpoint: "https://payments.example.com/rpc",
  timeoutMs: 15_000,
});
```

Then inject it directly in components without needing any boilerplate in `app.config.ts`:

```ts
import { Component, inject } from "@angular/core";
import { PaymentProcessing } from "./api/payment.js";

@Component({ ... })
export class CheckoutComponent {
  private paymentService = inject(PaymentProcessing);

  // Cold Observable by default:
  payment$ = this.paymentService.getPayment(1001n);

  // Promise-based execution via .promise:
  async process() {
    const res = await this.paymentService.promise.getPayment(1001n);
  }
}
```

Any global settings from `provideThriftConfig` (e.g. auth headers, Woody tracing) are automatically resolved and merged with the service's configuration.

## Advanced Usage

### Using Angular `HttpClient` with Interceptors

By default, `@vality/tsthrift` uses the global `fetch`. To route requests through Angular's HTTP pipeline (including Angular HTTP interceptors for auth tokens, telemetry, etc.), bridge `HttpClient` using `createHttpClientFetch`:

```ts
import { HttpClient } from "@angular/common/http";
import { createHttpClientFetch, provideThriftConfig } from "@vality/tsthrift-angular";

export function provideConfiguredThrift() {
  return [
    {
      provide: "THRIFT_FETCH_CONFIG",
      useFactory: (http: HttpClient) =>
        provideThriftConfig({
          endpoint: "/api/rpc",
          fetch: createHttpClientFetch(http),
        }),
      deps: [HttpClient],
    },
  ];
}
```

### Per-Service Configuration Overrides

Override configuration (such as distinct endpoints, headers, or timeouts) for an individual service:

```ts
import { provideThriftService } from "@vality/tsthrift-angular";
import { SERVICES } from "./generated/services/services.js";

export const appConfig: ApplicationConfig = {
  providers: [
    provideThriftConfig({ endpoint: "/api/rpc" }),
    // Specific service with a dedicated endpoint and timeout
    provideThriftService(SERVICES["reporting.Analytics"], {
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

Errors emitted by Observable clients preserve Thrift error types:

```ts
import { catchError, of } from "rxjs";
import { isThriftServiceError, isThriftSystemError } from "@vality/tsthrift";

this.paymentService.getPayment(id).pipe(
  catchError((err) => {
    if (isThriftServiceError(err, "PaymentNotFound")) {
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

- `createObservableService(descriptor, config?): ObservableServiceToken<TClient>`: Creates an injectable token self-providing the observable client in DI with optional unique per-service configuration.
- `provideThriftConfig(config: HttpTransportConfig): Provider`: Configures global Thrift settings.
- `provideThriftServices(...serviceLists): EnvironmentProviders`: Registers all generated service descriptors or tokens into Angular DI.
- `provideThriftService(target, config?): Provider`: Registers a single service descriptor or token with optional overrides.
- `getServiceToken(descriptor)` / `createServiceToken(descriptor)`: Returns the `InjectionToken<ObservableClient<TService>>` for the given service descriptor.
- `THRIFT_CONFIG`: Injection token for the global `HttpTransportConfig`.
- `THRIFT_SERVICES_REGISTRY`: Injection token for `Map<string, ThriftServiceDescriptor>`.

### RxJS & HTTP Utilities

- `toObservableClient(client, unwrap = true)`: Proxies a Thrift client into an Observable-returning client with `.promise` access to the underlying Promise client.
- `deferThriftCall(callFactory)`: Wraps a Promise Thrift call into a cold Observable.
- `unwrapResult()`: RxJS operator to unwrap `ThriftResult` streams.
- `createHttpClientFetch(httpClient)`: Bridges an Angular `HttpClient` instance to the Web `fetch` interface.

## License

Apache-2.0
