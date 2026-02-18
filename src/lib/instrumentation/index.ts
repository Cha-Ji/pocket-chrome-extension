// ============================================================
// Instrumentation — Public API
// ============================================================

export type { PocketOptionEnvironment, EnvironmentDetectionResult, EnvironmentSignals } from './env-detect';
export { detectEnvironment, resolveEnvironment } from './env-detect';

export type { DOMSnapshotResult, SelectorProbe } from './dom-snapshot';
export { captureDOMSnapshot } from './dom-snapshot';

export type { SchemaNode, WSSchemaEntry, WSSnapshotResult } from './ws-snapshot';
export { extractSchema, WSSchemaCollector } from './ws-snapshot';

export type { EnvSnapshotExport } from './env-instrumentation';
export { getEnvInstrumentation, installEnvDebugConsoleAPI } from './env-instrumentation';
