import type Database from 'better-sqlite3';
import type { Area, AreaExit, AreaObject, NPC, NPCDisposition } from '@reckoning/shared/game';
import { randomUUID } from 'crypto';

/**
 * Input for creating an area
 */
export interface CreateAreaInput {
  id?: string;
  name: string;
  description: string;
  tags?: string[];
}

/**
 * Input for creating an area exit
 */
export interface CreateAreaExitInput {
  areaId: string;
  direction: string;
  targetAreaId: string;
  description: string;
  locked?: boolean;
}

/**
 * Input for creating an area object
 */
export interface CreateAreaObjectInput {
  id?: string;
  areaId: string;
  name: string;
  description: string;
  interactable?: boolean;
  tags?: string[];
}

/**
 * Input for creating an NPC
 */
export interface CreateNPCInput {
  id?: string;
  name: string;
  description: string;
  currentAreaId: string;
  disposition?: NPCDisposition;
  tags?: string[];
}

/**
 * Repository for area queries and mutations
 */
export class AreaRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Create a new area
   */
  create(input: CreateAreaInput): Area {
    const id = input.id || randomUUID();
    const now = new Date().toISOString();
    const tagsJson = input.tags ? JSON.stringify(input.tags) : null;

    this.db.prepare(`
      INSERT INTO areas (id, name, description, tags, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, input.name, input.description, tagsJson, now);

    return {
      id,
      name: input.name,
      description: input.description,
      exits: [],
      objects: [],
      npcs: [],
      tags: input.tags || [],
    };
  }

  /**
   * Create an exit from one area to another
   */
  createExit(input: CreateAreaExitInput): AreaExit {
    this.db.prepare(`
      INSERT INTO area_exits (area_id, direction, target_area_id, description, locked)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      input.areaId,
      input.direction,
      input.targetAreaId,
      input.description,
      input.locked ? 1 : 0
    );

    const exit: AreaExit = {
      direction: input.direction,
      targetAreaId: input.targetAreaId,
      description: input.description,
    };
    // Only include locked if explicitly defined (exactOptionalPropertyTypes)
    if (input.locked !== undefined) {
      exit.locked = input.locked;
    }
    return exit;
  }

  /**
   * Create an interactable object in an area
   */
  createObject(input: CreateAreaObjectInput): AreaObject {
    const id = input.id || randomUUID();
    const tagsJson = input.tags ? JSON.stringify(input.tags) : null;

    this.db.prepare(`
      INSERT INTO area_objects (id, area_id, name, description, interactable, tags)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.areaId,
      input.name,
      input.description,
      input.interactable !== false ? 1 : 0,
      tagsJson
    );

    return {
      id,
      name: input.name,
      description: input.description,
      interactable: input.interactable !== false,
      tags: input.tags || [],
    };
  }

  /**
   * Create an NPC
   */
  createNPC(input: CreateNPCInput): NPC {
    const id = input.id || randomUUID();
    const now = new Date().toISOString();
    const tagsJson = input.tags ? JSON.stringify(input.tags) : null;
    const disposition = input.disposition || 'neutral';

    this.db.prepare(`
      INSERT INTO npcs (id, name, description, current_area_id, disposition, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.name, input.description, input.currentAreaId, disposition, tagsJson, now);

    return {
      id,
      name: input.name,
      description: input.description,
      currentAreaId: input.currentAreaId,
      disposition,
      tags: input.tags || [],
    };
  }

  /**
   * Delete an area and all related data (exits, objects)
   * Note: NPCs are not deleted, only their current_area_id is cleared
   */
  delete(id: string): void {
    const deleteArea = this.db.transaction(() => {
      this.db.prepare('DELETE FROM area_exits WHERE area_id = ?').run(id);
      this.db.prepare('DELETE FROM area_objects WHERE area_id = ?').run(id);
      this.db.prepare('UPDATE npcs SET current_area_id = NULL WHERE current_area_id = ?').run(id);
      this.db.prepare('DELETE FROM areas WHERE id = ?').run(id);
    });
    deleteArea();
  }

  /**
   * Delete an NPC
   */
  deleteNPC(id: string): void {
    this.db.prepare('DELETE FROM npcs WHERE id = ?').run(id);
  }

  /**
   * Find an area by ID (without related data)
   */
  findById(id: string): Area | null {
    const row = this.db.prepare(`
      SELECT id, name, description, tags FROM areas WHERE id = ?
    `).get(id) as AreaRow | undefined;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      exits: [],
      objects: [],
      npcs: [],
      tags: row.tags ? JSON.parse(row.tags) : [],
    };
  }

  /**
   * Find all areas
   */
  findAll(): Area[] {
    const rows = this.db.prepare(`
      SELECT id, name, description, tags FROM areas
    `).all() as AreaRow[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      exits: [],
      objects: [],
      npcs: [],
      tags: row.tags ? JSON.parse(row.tags) : [],
    }));
  }

  /**
   * Get an area with all related data (exits, objects, NPCs)
   */
  getWithDetails(id: string): (Area & { exits: AreaExit[]; objects: AreaObject[]; npcs: NPC[] }) | null {
    const areaRow = this.db.prepare(`
      SELECT id, name, description, tags FROM areas WHERE id = ?
    `).get(id) as AreaRow | undefined;

    if (!areaRow) return null;

    // Get exits
    const exitRows = this.db.prepare(`
      SELECT direction, target_area_id, description, locked FROM area_exits WHERE area_id = ?
    `).all(id) as ExitRow[];

    const exits: AreaExit[] = exitRows.map(e => ({
      direction: e.direction,
      targetAreaId: e.target_area_id,
      description: e.description || '',
      locked: e.locked === 1,
    }));

    // Get objects
    const objectRows = this.db.prepare(`
      SELECT id, name, description, interactable, tags FROM area_objects WHERE area_id = ?
    `).all(id) as ObjectRow[];

    const objects: AreaObject[] = objectRows.map(o => ({
      id: o.id,
      name: o.name,
      description: o.description || '',
      interactable: o.interactable === 1,
      tags: o.tags ? JSON.parse(o.tags) : [],
    }));

    // Get NPCs
    const npcRows = this.db.prepare(`
      SELECT id, name, description, current_area_id, disposition, tags FROM npcs WHERE current_area_id = ?
    `).all(id) as NPCRow[];

    const npcs: NPC[] = npcRows.map(n => ({
      id: n.id,
      name: n.name,
      description: n.description || '',
      currentAreaId: n.current_area_id,
      disposition: n.disposition as NPCDisposition,
      tags: n.tags ? JSON.parse(n.tags) : [],
    }));

    return {
      id: areaRow.id,
      name: areaRow.name,
      description: areaRow.description,
      exits,
      objects,
      npcs,
      tags: areaRow.tags ? JSON.parse(areaRow.tags) : [],
    };
  }

  /**
   * Get NPCs currently in an area
   */
  getNPCsInArea(areaId: string): NPC[] {
    const rows = this.db.prepare(`
      SELECT id, name, description, current_area_id, disposition, tags FROM npcs WHERE current_area_id = ?
    `).all(areaId) as NPCRow[];

    return rows.map(n => ({
      id: n.id,
      name: n.name,
      description: n.description || '',
      currentAreaId: n.current_area_id,
      disposition: n.disposition as NPCDisposition,
      tags: n.tags ? JSON.parse(n.tags) : [],
    }));
  }

  /**
   * Move an NPC to a different area
   */
  moveNPC(npcId: string, toAreaId: string): void {
    this.db.prepare(`
      UPDATE npcs SET current_area_id = ? WHERE id = ?
    `).run(toAreaId, npcId);
  }
}

interface AreaRow {
  id: string;
  name: string;
  description: string;
  tags: string | null;
}

interface ExitRow {
  direction: string;
  target_area_id: string;
  description: string | null;
  locked: number;
}

interface ObjectRow {
  id: string;
  name: string;
  description: string | null;
  interactable: number;
  tags: string | null;
}

interface NPCRow {
  id: string;
  name: string;
  description: string | null;
  current_area_id: string;
  disposition: string;
  tags: string | null;
}
