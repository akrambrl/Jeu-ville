/** Lecture minimale d'un fichier OSM XML (API 0.6). */
import { XMLParser } from 'fast-xml-parser';

export type Tags = Record<string, string>;

export interface OsmNode {
  id: string;
  lat: number;
  lon: number;
  tags: Tags;
}

export interface OsmWay {
  id: string;
  nodes: string[];
  tags: Tags;
}

export interface OsmRelation {
  id: string;
  members: { type: string; ref: string; role: string }[];
  tags: Tags;
}

export interface OsmData {
  nodes: Map<string, OsmNode>;
  ways: Map<string, OsmWay>;
  relations: OsmRelation[];
}

interface RawTag {
  k: string;
  v: string;
}

const ARRAY_TAGS = new Set(['node', 'way', 'relation', 'tag', 'nd', 'member']);

function toTags(raw: RawTag[] | undefined): Tags {
  const tags: Tags = {};
  for (const t of raw ?? []) tags[t.k] = t.v;
  return tags;
}

export function parseOsm(xml: string): OsmData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: false,
    isArray: (name) => ARRAY_TAGS.has(name),
  });
  const doc = parser.parse(xml) as {
    osm: {
      node?: { id: string; lat: string; lon: string; tag?: RawTag[] }[];
      way?: { id: string; nd?: { ref: string }[]; tag?: RawTag[] }[];
      relation?: { id: string; member?: { type: string; ref: string; role: string }[]; tag?: RawTag[] }[];
    };
  };

  const nodes = new Map<string, OsmNode>();
  for (const n of doc.osm.node ?? []) {
    nodes.set(n.id, { id: n.id, lat: Number(n.lat), lon: Number(n.lon), tags: toTags(n.tag) });
  }
  const ways = new Map<string, OsmWay>();
  for (const w of doc.osm.way ?? []) {
    ways.set(w.id, { id: w.id, nodes: (w.nd ?? []).map((nd) => nd.ref), tags: toTags(w.tag) });
  }
  const relations: OsmRelation[] = (doc.osm.relation ?? []).map((r) => ({
    id: r.id,
    members: (r.member ?? []).map((m) => ({ type: m.type, ref: m.ref, role: m.role })),
    tags: toTags(r.tag),
  }));
  return { nodes, ways, relations };
}
