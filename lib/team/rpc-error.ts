import { NextResponse } from 'next/server';

export type RpcErrorRule = { code: string; status: number; message: string };

const RPC_ERROR_PREFIX = /^ERROR:\s*/;
const RPC_ERROR_SUFFIX = /\(SQLSTATE P0001\)$/;

export function rpcErrorMessage(error: { message?: string } | null): string {
  if (!error?.message) return '';
  return error.message.replace(RPC_ERROR_PREFIX, '').replace(RPC_ERROR_SUFFIX, '').trim();
}

export function mapRpcError(error: { message?: string } | null, rules: RpcErrorRule[]): NextResponse | null {
  const message = rpcErrorMessage(error);
  if (!message) return null;
  const hit = rules.find((rule) => message.includes(rule.code));
  if (!hit) return null;
  return NextResponse.json({ error: hit.message, code: hit.code }, { status: hit.status });
}