import {
  parseConciergeRequest,
  parseConciergeResponse,
  parseConciergeValues,
  MAX_CONCIERGE_CONTEXT_AGE_MS,
  type ConciergeDevice,
  type ConciergeRequest,
} from "../../../shared/home-concierge/contract.ts";
import { corsHeaders } from "./cors.ts";
import type { EdgeRequestContext, RateLimitPolicy, RateLimitResult } from "./edgeSecurity.ts";
import { ConciergeProviderError, type ConciergeGeneration, type GroundedConciergeDevice } from "./conciergeProvider.ts";
import { isUuid, readJsonObject, RequestValidationError } from "./validation.ts";

export type ConciergeHome = {
  canDraft: boolean;
  devices: Array<ConciergeDevice & { name: string; roomName: string }>;
};

export type ConciergeHandlerDependencies = {
  authenticate: (request: Request) => Promise<string | null>;
  readHome: (request: Request, userId: string, homeId: string) => Promise<ConciergeHome | null>;
  configured: () => boolean;
  generate: (request: ConciergeGeneration, signal: AbortSignal) => Promise<unknown>;
  createContext: (request: Request) => EdgeRequestContext;
  limit: (context: EdgeRequestContext, policy: RateLimitPolicy) => Promise<RateLimitResult>;
  finalize: (context: EdgeRequestContext, response: Response, outcome: string, limit?: RateLimitResult) => Response;
  now?: () => number;
};

/** Join supplied simulation values to current caller-visible registry rows, never caller-supplied labels or authority. */
function groundSnapshot(request: ConciergeRequest, home: ConciergeHome, now: number): GroundedConciergeDevice[] | null {
  if (request.context.capturedAt > now + 5_000 || now - request.context.capturedAt > MAX_CONCIERGE_CONTEXT_AGE_MS) return null;
  const devices = new Map(home.devices.map((device) => [device.id, device]));
  const grounded: GroundedConciergeDevice[] = [];
  for (const item of request.context.devices) {
    const device = devices.get(item.id);
    const values = device && parseConciergeValues(item.values, device.kind);
    if (!device || !values) return null;
    grounded.push({ ...device, values });
  }
  return grounded;
}

/** Build a request-only concierge with explicit dependency boundaries for auth, budgets and provider failure tests. */
export function createConciergeHandler(deps: ConciergeHandlerDependencies): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    const context = deps.createContext(request);
    let budget: RateLimitResult | undefined;
    /** Return only bounded public copy and the standard payload-free operational metadata. */
    const respond = (status: number, body: unknown, outcome: string): Response => deps.finalize(context,
      new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json",
        "Cache-Control": "no-store" } }), outcome, budget);
    if (request.method !== "POST") return respond(405, { error: "Method not allowed." }, "method_rejected");
    try {
      const userId = await deps.authenticate(request);
      if (!userId) return respond(401, { error: "Sign in to use Vanta." }, "unauthorized");
      const body = await readJsonObject(request, 24_576, 6);
      const availability = body.operation === "availability";
      if (!isUuid(body.homeId) || (!availability && body.operation !== "ask")) {
        return respond(400, { error: "Invalid concierge request." }, "invalid_request");
      }
      if (availability && Object.keys(body).some((key) => !["operation", "homeId"].includes(key))) {
        return respond(400, { error: "Invalid concierge request." }, "invalid_request");
      }
      const { operation: _operation, ...askBody } = body;
      const parsed = availability ? null : parseConciergeRequest(askBody);
      if (!availability && !parsed) return respond(400, { error: "Invalid concierge request." }, "invalid_request");
      budget = await deps.limit({ ...context, endpoint: availability ? "home-concierge.availability" : "home-concierge.minute" },
        { actorId: userId, maxRequests: availability ? 30 : 8, windowSeconds: 60 });
      if (!budget.allowed) return respond(budget.reason ? 503 : 429,
        { error: budget.reason ? "Vanta is temporarily unavailable." : "Please pause before asking Vanta again." }, "limited");
      const home = await deps.readHome(request, userId, body.homeId);
      if (!home) return respond(403, { error: "Home access could not be verified." }, "home_denied");
      if (availability) return respond(200, { available: deps.configured() }, "availability_checked");
      if (!parsed || !deps.configured()) return respond(503, { error: "Vanta AI is not connected yet." }, "unavailable");
      const grounded = groundSnapshot(parsed, home, (deps.now ?? Date.now)());
      if (!grounded) return respond(409, { error: "Your home changed. Refresh it and ask again." }, "context_stale");
      for (const [endpoint, actorId, maxRequests] of [
        ["home-concierge.day", userId, 60],
        ["home-concierge.total-day", "home-concierge-server", 600],
      ] as const) {
        budget = await deps.limit({ ...context, endpoint }, { actorId, maxRequests, windowSeconds: 86_400, includeClientIp: false });
        if (!budget.allowed) return respond(budget.reason ? 503 : 429,
          { error: budget.reason ? "Vanta is temporarily unavailable." : "Vanta has reached its daily limit. Try again later." }, "limited");
      }
      const generated = await deps.generate({ question: parsed.question, devices: grounded, canDraft: home.canDraft }, request.signal);
      // The account may be revoked while generation runs. Re-read both identity and every included registry permission.
      const currentUser = await deps.authenticate(request);
      const currentHome = currentUser === userId ? await deps.readHome(request, userId, parsed.homeId) : null;
      const currentDevices = currentHome && groundSnapshot(parsed, currentHome, (deps.now ?? Date.now)());
      if (!currentHome || !currentDevices || currentHome.canDraft !== home.canDraft
        || JSON.stringify(currentDevices) !== JSON.stringify(grounded)) {
        return respond(409, { error: "Your home access changed. Reopen Vanta and try again." }, "scope_changed");
      }
      const answer = parseConciergeResponse(generated, currentDevices, currentHome.canDraft);
      if (!answer) return respond(502, { error: "Vanta could not prepare a valid answer. Please try again." }, "invalid_output");
      return respond(200, answer, "answered");
    } catch (error) {
      if (error instanceof RequestValidationError) return respond(400, { error: "Invalid concierge request." }, "invalid_request");
      if (error instanceof ConciergeProviderError) return respond(error.code === "invalid_response" ? 502 : 503,
        { error: error.code === "timeout" ? "Vanta took too long. Please try again." : "Vanta is temporarily unavailable." }, error.diagnosticCode);
      return respond(503, { error: "Vanta is temporarily unavailable." }, "unavailable");
    }
  };
}
