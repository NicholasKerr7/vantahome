declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

declare module "https://*" {
  export const createClient: (...args: unknown[]) => any;
}
