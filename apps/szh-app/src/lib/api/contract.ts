import type {
  Artifact, Conversation, CreateRunRequest, Health, Run, Solution, ValidationResult,
} from '@/types/domain';

/**
 * The single contract between UI and backend. Harness and Mock both implement it,
 * so pages never know which one is active.
 */
export interface DataSource {
  readonly kind: 'harness' | 'mock';
  health(): Promise<Health>;

  listSolutions(): Promise<Solution[]>;
  getSolution(id: string): Promise<Solution>;
  validateInput(solutionId: string, version: string, input: Record<string, unknown>): Promise<ValidationResult>;

  listRuns(): Promise<Run[]>;
  getRun(id: string): Promise<Run>;
  createRun(request: CreateRunRequest): Promise<Run>;
  cancelRun(id: string): Promise<void>;

  artifactUrl(artifact: Artifact): string;
  readArtifactText(artifact: Artifact, maxBytes?: number): Promise<string>;

  listConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation>;
  createConversation(content: string): Promise<Conversation>;
  sendMessage(conversationId: string, content: string): Promise<Conversation>;
  stopReply(conversationId: string): Promise<Conversation>;
}

/** Normalised error every page can render. */
export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 0) { super(message); }
  get offline() { return this.code === 'network_unreachable'; }
}
