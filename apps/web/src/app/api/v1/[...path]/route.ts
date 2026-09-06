import type { NextRequest } from 'next/server';
import { proxy } from '../../../../lib/proxy';

type RouteContext = { params: Promise<{ path: string[] }> };

async function handle(request: NextRequest, ctx: RouteContext): Promise<Response> {
  const { path } = await ctx.params;
  return proxy(request, path ?? []);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
export const OPTIONS = handle;
