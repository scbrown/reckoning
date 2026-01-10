import type Database from 'better-sqlite3';
import type { Area, AreaExit, AreaObject, NPC, NPCDisposition } from '@reckoning/shared/game';

/**
 * Repository for area queries
 */
export class AreaRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
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
