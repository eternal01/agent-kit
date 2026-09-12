import { Agent as HttpAgent, request as httpRequest } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import type { AnytypePropertyInput } from "./types.ts";

const DEFAULT_BASE_URL = "http://host.docker.internal:31010";
const DEFAULT_HOST_HEADER = "localhost:31010";
const DEFAULT_API_VERSION = "2025-11-08";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_GET_RETRIES = 2;
const httpAgent = new HttpAgent({ keepAlive: true, maxSockets: 10 });
const httpsAgent = new HttpsAgent({ keepAlive: true, maxSockets: 10 });
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);

class ResponseTooLargeError extends Error {}

export type AnytypeClientConfig = {
	baseUrl: string;
	hostHeader: string;
	apiVersion: string;
	apiKey: string;
	defaultSpaceId?: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AnytypeClientConfig {
	const baseUrl = (env.ANYTYPE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
	let parsed: URL;
	try {
		parsed = new URL(baseUrl);
	} catch {
		throw new Error("ANYTYPE_BASE_URL 不是有效 URL");
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error("ANYTYPE_BASE_URL 必须使用 HTTP 或 HTTPS");
	}
	const isLocal = LOCAL_HOSTS.has(parsed.hostname);
	const allowRemote = env.ANYTYPE_ALLOW_REMOTE === "1";
	if (!isLocal && !allowRemote) {
		throw new Error("ANYTYPE_BASE_URL 默认只允许本机地址；远程 HTTPS 服务需显式设置 ANYTYPE_ALLOW_REMOTE=1");
	}
	if (!isLocal && parsed.protocol !== "https:") {
		throw new Error("远程 Anytype API 必须使用 HTTPS");
	}

	return {
		baseUrl,
		hostHeader: env.ANYTYPE_HOST_HEADER || DEFAULT_HOST_HEADER,
		apiVersion: env.ANYTYPE_API_VERSION || DEFAULT_API_VERSION,
		apiKey: env.ANYTYPE_API_KEY || "",
		defaultSpaceId: env.ANYTYPE_DEFAULT_SPACE_ID || undefined,
	};
}

export function resolveSpaceId(config: AnytypeClientConfig, supplied?: string): string {
	const spaceId = supplied || config.defaultSpaceId;
	if (!spaceId) {
		throw new Error("缺少 space_id；请传入搜索结果中的 space_id，或设置 ANYTYPE_DEFAULT_SPACE_ID");
	}
	return spaceId;
}

export function validateProperties(properties?: AnytypePropertyInput[]): AnytypePropertyInput[] | undefined {
	if (!properties) return undefined;
	const valueKeys = [
		"text",
		"number",
		"checkbox",
		"date",
		"url",
		"email",
		"phone",
		"select",
		"multi_select",
		"files",
		"objects",
	] as const;

	for (const property of properties) {
		const present = valueKeys.filter((key) => property[key] !== undefined);
		if (present.length !== 1) {
			throw new Error(`属性 ${property.key || "<unknown>"} 必须且只能设置一个值字段`);
		}
	}
	return properties;
}

async function requestWithHost(
	url: URL,
	options: {
		method: string;
		headers: Record<string, string>;
		body?: string;
		signal: AbortSignal;
		maxResponseBytes: number;
	},
): Promise<{ ok: boolean; status: number; retryAfter?: string; text: () => Promise<string> }> {
	const request = url.protocol === "https:" ? httpsRequest : httpRequest;
	return new Promise((resolve, reject) => {
		let settled = false;
		let onAbort = () => {};
		const cleanup = () => options.signal.removeEventListener("abort", onAbort);
		const fail = (error: Error) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		};
		const requestOptions = {
			hostname: url.hostname,
			port: url.port || undefined,
			path: `${url.pathname}${url.search}`,
			method: options.method,
			headers: options.headers,
			agent: url.protocol === "https:" ? httpsAgent : httpAgent,
		};
		const req = request(requestOptions, (response) => {
			const chunks: Buffer[] = [];
			let responseBytes = 0;
			response.on("data", (chunk: Buffer) => {
				responseBytes += chunk.length;
				if (responseBytes > options.maxResponseBytes) {
					response.destroy();
					fail(new ResponseTooLargeError("Anytype API 响应体超过 8 MB"));
					return;
				}
				chunks.push(chunk);
			});
			response.once("error", fail);
			response.on("end", () => {
				if (settled) return;
				settled = true;
				cleanup();
				const text = Buffer.concat(chunks).toString("utf8");
				resolve({
					ok: (response.statusCode || 500) >= 200 && (response.statusCode || 500) < 300,
					status: response.statusCode || 500,
					retryAfter: typeof response.headers["retry-after"] === "string" ? response.headers["retry-after"] : undefined,
					text: async () => text,
				});
			});
		});
		onAbort = () => req.destroy(new Error("request aborted"));
		req.once("error", fail);
		if (options.signal.aborted) return onAbort();
		options.signal.addEventListener("abort", onAbort, { once: true });
		if (options.body !== undefined) req.write(options.body);
		req.end();
	});
}

function errorMessage(status: number, body: unknown): string {
	const apiMessage = (() => {
		if (!body || typeof body !== "object") return "";
		const record = body as Record<string, unknown>;
		const detail = record.message ?? record.detail ?? record.errors;
		if (detail === undefined) return "";
		const text = typeof detail === "string" ? detail : JSON.stringify(detail);
		return text ? `：${text.slice(0, 1000)}` : "";
	})();
	if (status === 400) return `Anytype 请求参数无效${apiMessage}`;
	if (status === 401) return "Anytype API Key 无效、缺失或已撤销";
	if (status === 403) return `Anytype API Key 没有执行该操作的权限${apiMessage}`;
	if (status === 404) return `Anytype Space、Object 或资源不存在${apiMessage}`;
	if (status === 409) return `Anytype 资源状态冲突${apiMessage}`;
	if (status === 410) return `Anytype Object 或资源已删除或归档${apiMessage}`;
	if (status === 422) return `Anytype 请求无法处理${apiMessage}`;
	if (status === 429) return "Anytype API 请求频率过高，请稍后重试";
	return `Anytype API 请求失败（HTTP ${status}）${apiMessage}`;
}

export class AnytypeClient {
	private readonly config: AnytypeClientConfig;

	constructor(config: AnytypeClientConfig = loadConfig()) {
		this.config = config;
	}

	get defaultSpaceId(): string | undefined {
		return this.config.defaultSpaceId;
	}

	async request<T>(
		method: "GET" | "POST" | "PATCH" | "DELETE",
		path: string,
		options: { query?: Record<string, string | number | undefined>; body?: unknown; signal?: AbortSignal } = {},
	): Promise<T> {
		if (!this.config.apiKey) {
			throw new Error("缺少 ANYTYPE_API_KEY；请在容器环境中注入 Anytype API Key");
		}

		const url = new URL(`${this.config.baseUrl}${path}`);
		for (const [key, value] of Object.entries(options.query || {})) {
			if (value !== undefined) url.searchParams.set(key, String(value));
		}

		const timeoutSignal = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
		const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
		const requestOptions = {
			method,
			headers: {
				Accept: "application/json",
				Host: this.config.hostHeader,
				Authorization: `Bearer ${this.config.apiKey}`,
				"Anytype-Version": this.config.apiVersion,
				...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
			},
			body: options.body === undefined ? undefined : JSON.stringify(options.body),
			signal,
			maxResponseBytes: MAX_RESPONSE_BYTES,
		};
		for (let attempt = 0; ; attempt++) {
			let response: Awaited<ReturnType<typeof requestWithHost>>;
			try {
				response = await requestWithHost(url, requestOptions);
			} catch (error) {
				if (signal.aborted) throw new Error("Anytype API 请求已取消或超时");
				if (error instanceof ResponseTooLargeError) throw error;
				throw new Error(`无法连接 Anytype API ${url.origin}；请确认宿主机 Anytype 正在运行且容器可访问 host.docker.internal`);
			}

			const text = await response.text();
			let payload: unknown = undefined;
			if (text) {
				try {
					payload = JSON.parse(text);
				} catch {
					payload = { message: text };
				}
			}
			if (response.status === 429 && method === "GET" && attempt < MAX_GET_RETRIES) {
				const retryAfter = Number(response.retryAfter);
				const delayMs = Number.isFinite(retryAfter) ? Math.min(Math.max(retryAfter * 1000, 100), 5000) : 250 * 2 ** attempt;
				await new Promise<void>((resolve, reject) => {
					let settled = false;
					const cleanup = () => signal.removeEventListener("abort", cancel);
					const finish = (fn: () => void) => {
						if (settled) return;
						settled = true;
						cleanup();
						fn();
					};
					const timer = setTimeout(() => finish(resolve), delayMs);
					const cancel = () => { clearTimeout(timer); finish(() => reject(new Error("request aborted"))); };
					if (signal.aborted) return cancel();
					signal.addEventListener("abort", cancel, { once: true });
				});
				continue;
			}
			if (!response.ok) throw new Error(errorMessage(response.status, payload));
			return payload as T;
		}
	}
}

export function objectPath(spaceId: string, objectId?: string): string {
	const root = `/v1/spaces/${encodeURIComponent(spaceId)}/objects`;
	return objectId ? `${root}/${encodeURIComponent(objectId)}` : root;
}
