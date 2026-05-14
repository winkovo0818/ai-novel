import { captureException } from "@/lib/observability/sentry";

export async function register() {
  // No SDK boot is required. captureException reads SENTRY_DSN lazily so
  // preview/local builds without Sentry configured stay side-effect free.
}

export async function onRequestError(
  err: unknown,
  request: {
    path?: string;
    method?: string;
    url?: string;
  },
  context: {
    routePath?: string;
    routeType?: string;
    routerKind?: string;
    renderSource?: string;
  },
) {
  await captureException(err, {
    source: "next.onRequestError",
    route: context.routePath ?? request.path ?? request.url,
    method: request.method,
    tags: {
      route_type: context.routeType,
      router_kind: context.routerKind,
      render_source: context.renderSource,
    },
  });
}
