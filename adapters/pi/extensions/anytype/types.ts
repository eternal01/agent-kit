export type AnytypePropertyInput = {
	key: string;
	text?: string;
	number?: number;
	checkbox?: boolean;
	date?: string;
	url?: string;
	email?: string;
	phone?: string;
	select?: string;
	multi_select?: string[];
	files?: string[];
	objects?: string[];
};

export type AnytypeObject = {
	id: string;
	space_id: string;
	name?: string;
	snippet?: string;
	markdown?: string;
	archived?: boolean;
	type?: { key?: string; name?: string };
	properties?: Array<Record<string, unknown>>;
};

export type ObjectResponse = { object: AnytypeObject };

export type AnytypeProperty = {
	id: string;
	key: string;
	name?: string;
	format?: string;
	objects?: string[];
};

export type PropertyResponse = { property: AnytypeProperty };

export type AnytypeListView = {
	id: string;
	name?: string;
	type?: string;
};

export type PaginatedProperties = {
	data?: AnytypeProperty[];
	properties?: AnytypeProperty[];
	pagination?: {
		total?: number;
		offset?: number;
		limit?: number;
		has_more?: boolean;
	};
};

export type ListViewsResponse = {
	data?: AnytypeListView[];
	views?: AnytypeListView[];
	pagination?: {
		total?: number;
		offset?: number;
		limit?: number;
		has_more?: boolean;
	};
};

export type AnytypeSpace = {
	id: string;
	name?: string;
	description?: string;
	icon?: unknown;
};

export type SpaceResponse = { space: AnytypeSpace };

export type TypeResponse = { type: AnytypeType };

export type TagResponse = { tag: AnytypeTag };

export type AnytypeType = {
	id: string;
	key?: string;
	name?: string;
	plural_name?: string;
	layout?: string;
	icon?: unknown;
};

export type AnytypeMember = {
	id: string;
	name?: string;
	global_name?: string;
	identity?: string;
	role?: string;
	status?: string;
	icon?: unknown;
};

export type MemberResponse = { member: AnytypeMember };

export type PaginatedMembers = {
	data?: AnytypeMember[];
	pagination?: PaginatedProperties["pagination"];
};

export type AnytypeTemplate = {
	id: string;
	name?: string;
	icon?: unknown;
};

export type TemplateResponse = { template: AnytypeTemplate };

export type AnytypeTag = {
	id: string;
	key?: string;
	name?: string;
	color?: string;
};

export type PaginatedSpaces = {
	data?: AnytypeSpace[];
	pagination?: PaginatedProperties["pagination"];
};

export type PaginatedTypes = {
	data?: AnytypeType[];
	pagination?: PaginatedProperties["pagination"];
};

export type PaginatedTags = {
	data?: AnytypeTag[];
	pagination?: PaginatedProperties["pagination"];
};

export type PaginatedTemplates = {
	data?: AnytypeTemplate[];
	pagination?: PaginatedProperties["pagination"];
};

export type PaginatedObjects = {
	data?: AnytypeObject[];
	objects?: AnytypeObject[];
	pagination?: {
		total?: number;
		offset?: number;
		limit?: number;
		has_more?: boolean;
	};
};
