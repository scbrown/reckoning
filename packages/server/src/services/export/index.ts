/**
 * Export Services
 *
 * Provides TOML, JSON, and JSONL export functionality for game state.
 * Implements the export format specification (EXPT-001).
 */

export { TomlExporter, type TomlExporterConfig } from './toml-exporter.js';
export { JsonExporter, type JsonExporterConfig } from './json-exporter.js';
export { GitIntegrationService, type GitIntegrationConfig } from './git-integration.js';

export {
  EXPORT_VERSION,
  EXPORT_FORMAT_VERSION,
  EXPORT_FORMAT_NAME,
  type ExportFormat,
  type TomlExportOptions,
  type ExportResult,
  type ExportManifest,
  type GameExport,
  type CharacterExport,
  type NpcExport,
  type LocationExport,
  type SceneExport,
  type SceneIndexExport,
  type SceneConnectionsExport,
  type TraitCatalogExport,
  type EntityTraitsExport,
  type RelationshipsExport,
  type FlagsExport,
  type JsonlEvent,
  type JsonExportOptions,
  type JsonExport,
  type JsonExportResult,
  type ExportedGame,
  type ExportedCharacter,
  type ExportedParty,
  type ExportedNPC,
  type ExportedArea,
  type ExportedScenes,
  type ExportedScene,
  type ExportedSceneConnection,
  type ExportedTraits,
  type ExportedRelationship,
  type ExportedEvent,
  type ExportedPendingEvolution,
  type ExportedEmergenceNotification,
  type ExportedFlags,
  // Git integration types
  type GitProvider,
  type GitOAuthConfig,
  type GitRemoteConfig,
  type GitIntegrationOptions,
  type GitIntegrationResult,
} from './types.js';
