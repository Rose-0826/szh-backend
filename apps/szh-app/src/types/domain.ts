/**
 * SZH core domain objects. Every page, URL and component prop is organised around these:
 *   Solution → SolutionVersion → Run → Artifact
 * Conversations (AI assist) reference Solutions/Runs but never own Run state or Artifacts.
 */

export type DataOrigin = 'harness' | 'mock';

export type JSONSchema = {
  type?: string | string[];
  title?: string;
  description?: string;
  enum?: (string | number)[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  required?: string[];
  properties?: Record<string, JSONSchema>;
  additionalProperties?: boolean;
  format?: string;
  /** SZH UI hints (optional, ignored by Harness validation). */
  'x-advanced'?: boolean;
  'x-unit'?: string;
  'x-widget'?: 'textarea';
  [key: string]: unknown;
};

export interface SolutionVersion {
  solutionId: string;
  version: string;
  publishedAt?: string;
  status: 'published' | 'draft';
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  runtime: { adapter: string; entrypoint: string };
  validationScope?: string;
  delivery: Record<string, unknown>;
  assets: { name?: string; kind?: string; url?: string; description?: string }[];
}

export interface Solution {
  id: string;
  name: string;
  description: string;
  domain: string;
  tags: string[];
  latestVersion: string;
  versions: SolutionVersion[];
  origin: DataOrigin;
}

/** Statuses the Harness actually emits today, plus the spec states reserved for later. */
export type RunStatus =
  | 'created' | 'validating' | 'queued' | 'running' | 'waiting_for_input'
  | 'cancel_requested' | 'succeeded' | 'failed' | 'cancelled';

export interface RunEvent {
  at: string;
  kind: 'status' | 'log' | 'artifact' | 'error';
  message: string;
  status?: RunStatus;
}

export interface Artifact {
  id: string;
  runId: string;
  name: string;
  size: number;
  sha256?: string;
  kind: ArtifactKind;
}

export type ArtifactKind = 'image' | 'table' | 'pdf' | 'json' | 'text' | 'model' | 'archive' | 'binary';

export interface Run {
  id: string;
  solutionId: string;
  solutionName: string;
  version: string;
  status: RunStatus;
  input: Record<string, unknown>;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  events: RunEvent[];
  artifacts: Artifact[];
  sourceRunId?: string;
  origin: DataOrigin;
}

export interface CreateRunRequest {
  solutionId: string;
  version: string;
  input: Record<string, unknown>;
  requestId: string;
  sourceRunId?: string;
}

export type ValidationResult = { valid: true } | { valid: false; message: string; fieldErrors: Record<string, string> };

export interface ConversationMessage {
  id: string;
  content: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'stopped' | 'interrupted' | 'stopping';
  reply?: string | null;
  error?: string | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: ConversationMessage[];
  origin: DataOrigin;
}

export interface Health {
  online: boolean;
  modelConfigured: boolean;
  model?: string;
  checkedAt: string;
}
