import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { AnytypeClient, loadConfig, objectPath, resolveSpaceId, validateProperties } from "./client.ts";
import type {
	AnytypeMember,
	AnytypeObject,
	AnytypeProperty,
	AnytypeSpace,
	AnytypeTag,
	AnytypeTemplate,
	AnytypeType,
	ListViewsResponse,
	ObjectResponse,
	PaginatedMembers,
	PaginatedObjects,
	PaginatedProperties,
	PaginatedSpaces,
	PaginatedTags,
	PaginatedTemplates,
	PaginatedTypes,
	MemberResponse,
	PropertyResponse,
	SpaceResponse,
	TagResponse,
	TemplateResponse,
	TypeResponse,
} from "./types.ts";

const propertySchema = Type.Object({
	key: Type.String({ description: "Anytype property key" }),
	text: Type.Optional(Type.String()),
	number: Type.Optional(Type.Number()),
	checkbox: Type.Optional(Type.Boolean()),
	date: Type.Optional(Type.String({ description: "RFC3339 or YYYY-MM-DD" })),
	url: Type.Optional(Type.String()),
	email: Type.Optional(Type.String()),
	phone: Type.Optional(Type.String()),
	select: Type.Optional(Type.String({ description: "Tag key or ID" })),
	multi_select: Type.Optional(Type.Array(Type.String())),
	files: Type.Optional(Type.Array(Type.String({ description: "File object ID" }))),
	objects: Type.Optional(Type.Array(Type.String({ description: "Object ID" }))),
});

const spaceIdSchema = Type.Optional(
	Type.String({ description: "Anytype space ID; defaults to ANYTYPE_DEFAULT_SPACE_ID" }),
);

const pagingSchema = {
	offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
	limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000, default: 50 })),
};

const objectIdsSchema = Type.Array(Type.String({ description: "Anytype object ID" }), { minItems: 1, maxItems: 100 });
const relationObjectIdsSchema = Type.Array(Type.String({ description: "Anytype object ID" }), { maxItems: 100 });

const propertyFormatSchema = Type.Union([
	Type.Literal("text"),
	Type.Literal("number"),
	Type.Literal("select"),
	Type.Literal("multi_select"),
	Type.Literal("date"),
	Type.Literal("files"),
	Type.Literal("checkbox"),
	Type.Literal("url"),
	Type.Literal("email"),
	Type.Literal("phone"),
	Type.Literal("objects"),
]);

function json(data: unknown) {
	return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], details: data };
}

function valuePreview(value: unknown): unknown {
	if (typeof value === "string") return value.length > 1000 ? `${value.slice(0, 1000)}…[truncated]` : value;
	if (Array.isArray(value)) {
		const values = value.slice(0, 20).map(valuePreview);
		if (value.length > 20) values.push("[truncated]");
		return values;
	}
	if (value && typeof value === "object") {
		const entries = Object.entries(value);
		const preview = Object.fromEntries(entries.slice(0, 20).map(([key, item]) => [key, valuePreview(item)]));
		if (entries.length > 20) preview.__truncated = true;
		return preview;
	}
	return value;
}

function compactProperties(properties: AnytypeObject["properties"]): { values: unknown[]; truncated: boolean } {
	const allProperties = properties || [];
	return {
		values: allProperties.slice(0, 100).map((property) => valuePreview(property)),
		truncated: allProperties.length > 100,
	};
}

function compactObject(object: AnytypeObject) {
	const lastModified = object.properties?.find((property) => property.key === "last_modified_date");
	return {
		id: object.id,
		space_id: object.space_id,
		name: object.name,
		type_key: object.type?.key,
		snippet: object.snippet,
		last_modified_date: lastModified?.date,
		archived: object.archived,
	};
}

function compactMember(member: AnytypeMember) {
	return {
		id: member.id,
		name: member.name,
		global_name: member.global_name,
		identity: member.identity,
		role: member.role,
		status: member.status,
		icon: member.icon,
	};
}

function compactSpace(space: AnytypeSpace) {
	return { id: space.id, name: space.name, description: space.description, icon: space.icon };
}

function compactType(type: AnytypeType) {
	return { id: type.id, key: type.key, name: type.name, plural_name: type.plural_name, layout: type.layout, icon: type.icon };
}

function compactTag(tag: AnytypeTag) {
	return { id: tag.id, key: tag.key, name: tag.name, color: tag.color };
}

function compactTemplate(template: AnytypeTemplate) {
	return { id: template.id, name: template.name, icon: template.icon };
}

function compactProperty(property: AnytypeProperty) {
	return {
		id: property.id,
		key: property.key,
		name: property.name,
		format: property.format,
		objects: property.objects,
	};
}

function listObjectsPath(spaceId: string, listId: string, viewId: string): string {
	return `/v1/spaces/${encodeURIComponent(spaceId)}/lists/${encodeURIComponent(listId)}/views/${encodeURIComponent(viewId)}/objects`;
}

function propertyPath(spaceId: string, propertyId: string): string {
	return `/v1/spaces/${encodeURIComponent(spaceId)}/properties/${encodeURIComponent(propertyId)}`;
}

const SYSTEM_PROPERTY_KEYS = new Set([
	"links",
	"backlinks",
	"created_date",
	"creator",
	"last_modified_date",
	"last_modified_by",
	"last_opened_date",
]);

function assertUserProperty(property: AnytypeProperty, expectedFormat?: string): void {
	if (SYSTEM_PROPERTY_KEYS.has(property.key)) {
		throw new Error(`属性 ${property.key} 是 Anytype 系统属性，不能通过此工具修改`);
	}
	if (expectedFormat && property.format !== expectedFormat) {
		throw new Error(`属性 ${property.key} 的格式为 ${property.format || "unknown"}，需要 ${expectedFormat}`);
	}
}

function icon(iconEmoji?: string): { format: "emoji"; emoji: string } | undefined {
	return iconEmoji ? { format: "emoji", emoji: iconEmoji } : undefined;
}

export default function anytypeExtension(pi: ExtensionAPI) {
	const client = new AnytypeClient(loadConfig());

	pi.registerTool({
		name: "anytype_search",
		label: "Anytype Search",
		description: "Search Anytype objects globally or within one space. Results contain summaries; use anytype_get for full Markdown.",
		promptSnippet: "Search objects in the user's Anytype knowledge space",
		promptGuidelines: [
			"Use anytype_search when an Anytype object ID is unknown, and never guess an object or space ID.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "Text matched against object names and snippets" }),
			space_id: spaceIdSchema,
			types: Type.Optional(Type.Array(Type.String({ description: "Type key, for example page or task" }))),
			offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000, default: 10 })),
		}),
		async execute(_toolCallId, params, signal) {
			const offset = params.offset ?? 0;
			const limit = params.limit ?? 10;
			const path = params.space_id
				? `/v1/spaces/${encodeURIComponent(params.space_id)}/search`
				: "/v1/search";
			const response = await client.request<PaginatedObjects>("POST", path, {
				query: { offset, limit },
				body: {
					query: params.query,
					...(params.types ? { types: params.types } : {}),
					sort: { direction: "desc", property_key: "last_modified_date" },
				},
				signal,
			});
			const objects = response.data || response.objects || [];
			return json({ results: objects.map(compactObject), pagination: response.pagination });
		},
	});

	pi.registerTool({
		name: "anytype_list_spaces",
		label: "Anytype List Spaces",
		description: "List spaces accessible by the current Anytype API key.",
		parameters: Type.Object({ ...pagingSchema }),
		async execute(_toolCallId, params, signal) {
			const response = await client.request<PaginatedSpaces>("GET", "/v1/spaces", {
				query: { offset: params.offset ?? 0, limit: params.limit ?? 50 }, signal,
			});
			return json({ spaces: (response.data || []).map(compactSpace), pagination: response.pagination });
		},
	});

	pi.registerTool({
		name: "anytype_create_space",
		label: "Anytype Create Space",
		description: "Create an Anytype space.",
		promptGuidelines: ["Only call this when the user explicitly asks to create an Anytype space."],
		parameters: Type.Object({ name: Type.String(), description: Type.Optional(Type.String()) }),
		async execute(_toolCallId, params, signal) {
			const response = await client.request<SpaceResponse>("POST", "/v1/spaces", {
				body: { name: params.name, ...(params.description !== undefined ? { description: params.description } : {}) }, signal,
			});
			return json({ created: compactSpace(response.space) });
		},
	});

	pi.registerTool({
		name: "anytype_update_space",
		label: "Anytype Update Space",
		description: "Update an Anytype space name or description.",
		promptGuidelines: ["Only call this when the user explicitly asks to update an Anytype space."],
		parameters: Type.Object({ space_id: Type.String(), name: Type.Optional(Type.String()), description: Type.Optional(Type.String()) }),
		async execute(_toolCallId, params, signal) {
			if (params.name === undefined && params.description === undefined) throw new Error("至少需要 name 或 description");
			const response = await client.request<SpaceResponse>("PATCH", `/v1/spaces/${encodeURIComponent(params.space_id)}`, {
				body: { ...(params.name !== undefined ? { name: params.name } : {}), ...(params.description !== undefined ? { description: params.description } : {}) }, signal,
			});
			return json({ updated: compactSpace(response.space) });
		},
	});

	pi.registerTool({
		name: "anytype_get_space",
		label: "Anytype Get Space",
		description: "Get metadata for one Anytype space.",
		parameters: Type.Object({ space_id: Type.String() }),
		async execute(_toolCallId, params, signal) {
			const response = await client.request<SpaceResponse>("GET", `/v1/spaces/${encodeURIComponent(params.space_id)}`, { signal });
			return json({ space: compactSpace(response.space) });
		},
	});

	pi.registerTool({
		name: "anytype_list_members",
		label: "Anytype List Members",
		description: "List members of an Anytype space with roles and statuses.",
		parameters: Type.Object({ space_id: spaceIdSchema, ...pagingSchema }),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const response = await client.request<PaginatedMembers>("GET", `/v1/spaces/${encodeURIComponent(spaceId)}/members`, {
				query: { offset: params.offset ?? 0, limit: params.limit ?? 50 }, signal,
			});
			return json({ members: (response.data || []).map(compactMember), pagination: response.pagination });
		},
	});

	pi.registerTool({
		name: "anytype_get_member",
		label: "Anytype Get Member",
		description: "Get one Anytype space member by member ID.",
		parameters: Type.Object({ space_id: spaceIdSchema, member_id: Type.String() }),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const response = await client.request<MemberResponse>("GET", `/v1/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(params.member_id)}`, { signal });
			return json({ member: compactMember(response.member) });
		},
	});

	pi.registerTool({
		name: "anytype_list_objects_in_space",
		label: "Anytype List Objects in Space",
		description: "List objects in a space without text search; useful for synchronization and collection discovery.",
		parameters: Type.Object({ space_id: spaceIdSchema, ...pagingSchema }),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const response = await client.request<PaginatedObjects>("GET", objectPath(spaceId), {
				query: { offset: params.offset ?? 0, limit: params.limit ?? 50 }, signal,
			});
			const objects = response.data || response.objects || [];
			return json({ objects: objects.map(compactObject), pagination: response.pagination });
		},
	});

	pi.registerTool({
		name: "anytype_list_types",
		label: "Anytype List Types",
		description: "List object types available in an Anytype space. Use the returned keys for object creation and search filters.",
		parameters: Type.Object({ space_id: spaceIdSchema, ...pagingSchema }),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const response = await client.request<PaginatedTypes>("GET", `/v1/spaces/${encodeURIComponent(spaceId)}/types`, {
				query: { offset: params.offset ?? 0, limit: params.limit ?? 50 }, signal,
			});
			return json({ types: (response.data || []).map(compactType), pagination: response.pagination });
		},
	});

	pi.registerTool({
		name: "anytype_get_type",
		label: "Anytype Get Type",
		description: "Get an object type definition by type ID.",
		parameters: Type.Object({ space_id: spaceIdSchema, type_id: Type.String() }),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const response = await client.request<TypeResponse>("GET", `/v1/spaces/${encodeURIComponent(spaceId)}/types/${encodeURIComponent(params.type_id)}`, { signal });
			return json({ type: compactType(response.type) });
		},
	});

	pi.registerTool({
		name: "anytype_list_tags",
		label: "Anytype List Tags",
		description: "List tags belonging to an Anytype property.",
		parameters: Type.Object({ space_id: spaceIdSchema, property_id: Type.String(), ...pagingSchema }),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const path = `/v1/spaces/${encodeURIComponent(spaceId)}/properties/${encodeURIComponent(params.property_id)}/tags`;
			const response = await client.request<PaginatedTags>("GET", path, {
				query: { offset: params.offset ?? 0, limit: params.limit ?? 50 }, signal,
			});
			return json({ tags: (response.data || []).map(compactTag), pagination: response.pagination });
		},
	});

	pi.registerTool({
		name: "anytype_create_tag",
		label: "Anytype Create Tag",
		description: "Create a tag for a select or multi_select property.",
		promptGuidelines: ["Only call this when the user explicitly asks to create an Anytype tag."],
		parameters: Type.Object({
			space_id: spaceIdSchema,
			property_id: Type.String(),
			name: Type.String(),
			color: Type.Union([
				Type.Literal("grey"), Type.Literal("yellow"), Type.Literal("orange"), Type.Literal("red"),
				Type.Literal("pink"), Type.Literal("purple"), Type.Literal("blue"), Type.Literal("ice"),
				Type.Literal("teal"), Type.Literal("lime"),
			]),
			key: Type.Optional(Type.String()),
		}),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const path = `/v1/spaces/${encodeURIComponent(spaceId)}/properties/${encodeURIComponent(params.property_id)}/tags`;
			const response = await client.request<TagResponse>("POST", path, {
				body: { name: params.name, color: params.color, ...(params.key ? { key: params.key } : {}) }, signal,
			});
			return json({ created: compactTag(response.tag) });
		},
	});

	pi.registerTool({
		name: "anytype_get_tag",
		label: "Anytype Get Tag",
		description: "Get a tag by property ID and tag ID.",
		parameters: Type.Object({ space_id: spaceIdSchema, property_id: Type.String(), tag_id: Type.String() }),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const path = `/v1/spaces/${encodeURIComponent(spaceId)}/properties/${encodeURIComponent(params.property_id)}/tags/${encodeURIComponent(params.tag_id)}`;
			const response = await client.request<TagResponse>("GET", path, { signal });
			return json({ tag: compactTag(response.tag) });
		},
	});

	pi.registerTool({
		name: "anytype_delete_tag",
		label: "Anytype Delete Tag",
		description: "Archive a tag from a select or multi_select property.",
		promptGuidelines: ["Only call this when the user explicitly asks to delete an Anytype tag."],
		parameters: Type.Object({ space_id: spaceIdSchema, property_id: Type.String(), tag_id: Type.String() }),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const path = `/v1/spaces/${encodeURIComponent(spaceId)}/properties/${encodeURIComponent(params.property_id)}/tags/${encodeURIComponent(params.tag_id)}`;
			const response = await client.request<TagResponse>("DELETE", path, { signal });
			return json({ deleted: compactTag(response.tag) });
		},
	});

	pi.registerTool({
		name: "anytype_list_templates",
		label: "Anytype List Templates",
		description: "List templates associated with an Anytype object type.",
		parameters: Type.Object({ space_id: spaceIdSchema, type_id: Type.String(), ...pagingSchema }),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const path = `/v1/spaces/${encodeURIComponent(spaceId)}/types/${encodeURIComponent(params.type_id)}/templates`;
			const response = await client.request<PaginatedTemplates>("GET", path, {
				query: { offset: params.offset ?? 0, limit: params.limit ?? 50 }, signal,
			});
			return json({ templates: (response.data || []).map(compactTemplate), pagination: response.pagination });
		},
	});

	pi.registerTool({
		name: "anytype_get_template",
		label: "Anytype Get Template",
		description: "Get a template by type ID and template ID.",
		parameters: Type.Object({ space_id: spaceIdSchema, type_id: Type.String(), template_id: Type.String() }),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const path = `/v1/spaces/${encodeURIComponent(spaceId)}/types/${encodeURIComponent(params.type_id)}/templates/${encodeURIComponent(params.template_id)}`;
			const response = await client.request<TemplateResponse>("GET", path, { signal });
			return json({ template: compactTemplate(response.template) });
		},
	});

	pi.registerTool({
		name: "anytype_get",

		label: "Anytype Get",
		description: "Get one Anytype object, including a bounded slice of its Markdown body and its properties.",
		promptSnippet: "Read an Anytype object by space ID and object ID",
		promptGuidelines: ["Use anytype_get before replacing an Anytype object's Markdown with anytype_update."],
		parameters: Type.Object({
			object_id: Type.String({ description: "Object ID returned by search" }),
			space_id: spaceIdSchema,
			markdown_offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
			markdown_limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 12000, default: 12000 })),
		}),
		async execute(_toolCallId, params, signal) {
			const spaceId = resolveSpaceId(loadConfig(), params.space_id);
			const response = await client.request<ObjectResponse>("GET", objectPath(spaceId, params.object_id), {
				query: { format: "md" },
				signal,
			});
			const object = response.object;
			const markdown = object.markdown || "";
			const requestedOffset = params.markdown_offset ?? 0;
			const offset = Math.min(requestedOffset, markdown.length);
			const limit = params.markdown_limit ?? 12000;
			const end = Math.min(markdown.length, offset + limit);
			const compactedProperties = compactProperties(object.properties);
			return json({
				...compactObject(object),
				markdown: markdown.slice(offset, end),
				properties: compactedProperties.values,
				properties_truncated: compactedProperties.truncated,
				markdown_page: {
					offset,
					returned: end - offset,
					total: markdown.length,
					has_more: end < markdown.length,
					next_offset: end < markdown.length ? end : undefined,
				},
			});
		},
	});

	pi.registerTool({
		name: "anytype_create",
		label: "Anytype Create",
		description: "Create an Anytype object. This is a write operation and must only be used when the user explicitly asks to create content.",
		promptSnippet: "Create an object in the user's Anytype knowledge space",
		promptGuidelines: ["Only call anytype_create when the user explicitly requests an Anytype write operation."],
		parameters: Type.Object({
			space_id: spaceIdSchema,
			name: Type.Optional(Type.String()),
			markdown: Type.Optional(Type.String({ description: "Markdown body" })),
			type_key: Type.Optional(Type.String({ description: "Defaults to page" })),
			icon_emoji: Type.Optional(Type.String()),
			properties: Type.Optional(Type.Array(propertySchema)),
		}),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const response = await client.request<ObjectResponse>("POST", objectPath(spaceId), {
				body: {
					type_key: params.type_key || "page",
					...(params.name !== undefined ? { name: params.name } : {}),
					...(params.markdown !== undefined ? { body: params.markdown } : {}),
					...(params.icon_emoji ? { icon: icon(params.icon_emoji) } : {}),
					...(params.properties ? { properties: validateProperties(params.properties) } : {}),
				},
				signal,
			});
			return json({ created: compactObject(response.object) });
		},
	});

	pi.registerTool({
		name: "anytype_archive",
		label: "Anytype Archive Object",
		description: "Archive an Anytype object. This is the API's delete operation and does not remove the underlying data permanently.",
		promptGuidelines: ["Only call this when the user explicitly asks to archive or delete an Anytype object."],
		parameters: Type.Object({ object_id: Type.String(), space_id: spaceIdSchema }),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const response = await client.request<ObjectResponse>("DELETE", objectPath(spaceId, params.object_id), { signal });
			return json({ archived: compactObject(response.object) });
		},
	});

	pi.registerTool({
		name: "anytype_update",
		label: "Anytype Update",
		description: "Update selected fields of an Anytype object. markdown replaces the complete body; read the object first and preserve content unless replacement is explicit.",
		promptSnippet: "Update an existing Anytype object",
		promptGuidelines: [
			"Only call anytype_update when the user explicitly requests a write operation.",
			"The anytype_update markdown argument replaces the complete body; call anytype_get first and preserve existing content unless the user explicitly requests replacement.",
		],
		parameters: Type.Object({
			object_id: Type.String({ description: "Object ID returned by search" }),
			space_id: spaceIdSchema,
			name: Type.Optional(Type.String()),
			markdown: Type.Optional(Type.String({ description: "Complete replacement Markdown body" })),
			type_key: Type.Optional(Type.String()),
			icon_emoji: Type.Optional(Type.String()),
			properties: Type.Optional(Type.Array(propertySchema)),
		}),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const body = {
				...(params.name !== undefined ? { name: params.name } : {}),
				...(params.markdown !== undefined ? { markdown: params.markdown } : {}),
				...(params.type_key !== undefined ? { type_key: params.type_key } : {}),
				...(params.icon_emoji ? { icon: icon(params.icon_emoji) } : {}),
				...(params.properties ? { properties: validateProperties(params.properties) } : {}),
			};
			if (Object.keys(body).length === 0) throw new Error("anytype_update 至少需要一个待更新字段");
			const response = await client.request<ObjectResponse>("PATCH", objectPath(spaceId, params.object_id), {
				body,
				signal,
			});
			return json({ updated: compactObject(response.object), markdown_length: response.object.markdown?.length });
		},
	});

	pi.registerTool({
		name: "anytype_set_object_relation",
		label: "Anytype Set Object Relation",
		description: "Set a user-defined Objects relation on an Anytype object. This creates a native clickable relation; do not use the reserved links/backlinks properties.",
		promptGuidelines: [
			"Only call this when the user explicitly requests an object relation.",
			"The property_key must be a user-defined property with format objects; never use links or backlinks.",
		],
		parameters: Type.Object({
			object_id: Type.String({ description: "Source object ID" }),
			space_id: spaceIdSchema,
			property_key: Type.String({ description: "User-defined Objects property key" }),
			target_object_ids: relationObjectIdsSchema,
		}),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const properties = await client.request<PaginatedProperties>("GET", `/v1/spaces/${encodeURIComponent(spaceId)}/properties`, {
				query: { offset: 0, limit: 1000 }, signal,
			});
			const property = (properties.data || properties.properties || []).find((item) => item.key === params.property_key);
			if (!property) throw new Error(`找不到用户属性 ${params.property_key}`);
			assertUserProperty(property, "objects");
			const response = await client.request<ObjectResponse>("PATCH", objectPath(spaceId, params.object_id), {
				body: { properties: [{ key: params.property_key, objects: params.target_object_ids }] },
				signal,
			});
			return json({
				updated: compactObject(response.object),
				relation: { property_key: params.property_key, target_object_ids: params.target_object_ids },
			});
		},
	});

	pi.registerTool({
		name: "anytype_list_properties",
		label: "Anytype List Properties",
		description: "List properties available in an Anytype space, including user-defined object relations.",
		parameters: Type.Object({ space_id: spaceIdSchema, ...pagingSchema }),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const response = await client.request<PaginatedProperties>("GET", `/v1/spaces/${encodeURIComponent(spaceId)}/properties`, {
				query: { offset: params.offset ?? 0, limit: params.limit ?? 50 }, signal,
			});
			const properties = response.data || response.properties || [];
			return json({ properties: properties.map(compactProperty), pagination: response.pagination });
		},
	});

	pi.registerTool({
		name: "anytype_create_property",
		label: "Anytype Create Property",
		description: "Create a user-defined Anytype property. Use format objects for relations between knowledge objects.",
		promptGuidelines: ["Only call this when the user explicitly asks to create an Anytype property."],
		parameters: Type.Object({
			space_id: spaceIdSchema,
			name: Type.String({ description: "Display name" }),
			key: Type.Optional(Type.String({ description: "snake_case property key" })),
			format: propertyFormatSchema,
		}),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const response = await client.request<PropertyResponse>("POST", `/v1/spaces/${encodeURIComponent(spaceId)}/properties`, {
				body: { name: params.name, format: params.format, ...(params.key ? { key: params.key } : {}) }, signal,
			});
			return json({ created: compactProperty(response.property) });
		},
	});

	pi.registerTool({
		name: "anytype_update_property",
		label: "Anytype Update Property",
		description: "Rename or change the key of a user-defined Anytype property.",
		promptGuidelines: ["Only call this when the user explicitly requests a property update."],
		parameters: Type.Object({
			space_id: spaceIdSchema,
			property_id: Type.String(),
			name: Type.String(),
			key: Type.Optional(Type.String()),
		}),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const path = propertyPath(spaceId, params.property_id);
			const current = await client.request<PropertyResponse>("GET", path, { signal });
			assertUserProperty(current.property);
			if (params.key && SYSTEM_PROPERTY_KEYS.has(params.key)) throw new Error(`不能将用户属性重命名为系统属性 ${params.key}`);
			const response = await client.request<PropertyResponse>("PATCH", path, {
				body: { name: params.name, ...(params.key ? { key: params.key } : {}) }, signal,
			});
			return json({ updated: compactProperty(response.property) });
		},
	});

	pi.registerTool({
		name: "anytype_delete_property",
		label: "Anytype Delete Property",
		description: "Archive a user-defined Anytype property.",
		promptGuidelines: ["Only call this when the user explicitly requests deleting a property."],
		parameters: Type.Object({ space_id: spaceIdSchema, property_id: Type.String() }),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const path = propertyPath(spaceId, params.property_id);
			const current = await client.request<PropertyResponse>("GET", path, { signal });
			assertUserProperty(current.property);
			const response = await client.request<PropertyResponse>("DELETE", path, { signal });
			return json({ deleted: compactProperty(response.property) });
		},
	});

	pi.registerTool({
		name: "anytype_get_property",
		label: "Anytype Get Property",
		description: "Get an Anytype property by property ID.",
		parameters: Type.Object({ space_id: spaceIdSchema, property_id: Type.String() }),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const response = await client.request<PropertyResponse>("GET", `/v1/spaces/${encodeURIComponent(spaceId)}/properties/${encodeURIComponent(params.property_id)}`, { signal });
			return json({ property: compactProperty(response.property) });
		},
	});

	pi.registerTool({
		name: "anytype_list_views",
		label: "Anytype List Views",
		description: "List the views of an Anytype Collection/List object.",
		parameters: Type.Object({ space_id: spaceIdSchema, list_id: Type.String(), ...pagingSchema }),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const path = `/v1/spaces/${encodeURIComponent(spaceId)}/lists/${encodeURIComponent(params.list_id)}/views`;
			const response = await client.request<ListViewsResponse>("GET", path, {
				query: { offset: params.offset ?? 0, limit: params.limit ?? 50 }, signal,
			});
			const views = response.data || response.views || [];
			return json({ views, pagination: response.pagination });
		},
	});

	pi.registerTool({
		name: "anytype_list_objects",
		label: "Anytype List Objects",
		description: "List objects contained in an Anytype Collection/List view.",
		parameters: Type.Object({ space_id: spaceIdSchema, list_id: Type.String(), view_id: Type.String(), ...pagingSchema }),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const response = await client.request<PaginatedObjects>("GET", listObjectsPath(spaceId, params.list_id, params.view_id), {
				query: { offset: params.offset ?? 0, limit: params.limit ?? 50 }, signal,
			});
			const objects = response.data || response.objects || [];
			return json({ objects: objects.map(compactObject), pagination: response.pagination });
		},
	});

	pi.registerTool({
		name: "anytype_add_objects_to_list",
		label: "Anytype Add Objects to List",
		description: "Add existing Anytype objects to a Collection/List.",
		promptGuidelines: ["Only call this when the user explicitly asks to organize or add objects to an Anytype list."],
		parameters: Type.Object({ space_id: spaceIdSchema, list_id: Type.String(), object_ids: objectIdsSchema }),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const path = `/v1/spaces/${encodeURIComponent(spaceId)}/lists/${encodeURIComponent(params.list_id)}/objects`;
			const response = await client.request<unknown>("POST", path, { body: { objects: params.object_ids }, signal });
			return json({ added: params.object_ids, response });
		},
	});

	pi.registerTool({
		name: "anytype_remove_object_from_list",
		label: "Anytype Remove Object from List",
		description: "Remove an object from an Anytype Collection/List.",
		promptGuidelines: ["Only call this when the user explicitly asks to remove an object from an Anytype list."],
		parameters: Type.Object({ space_id: spaceIdSchema, list_id: Type.String(), object_id: Type.String() }),
		async execute(_toolCallId, params, signal) {
			const config = loadConfig();
			const spaceId = resolveSpaceId(config, params.space_id);
			const path = `/v1/spaces/${encodeURIComponent(spaceId)}/lists/${encodeURIComponent(params.list_id)}/objects/${encodeURIComponent(params.object_id)}`;
			await client.request<unknown>("DELETE", path, { signal });
			return json({ removed: { list_id: params.list_id, object_id: params.object_id } });
		},
	});
}
