// TypeScript types shared across the app
export type UserRole = 'ADMIN' | 'DEVELOPER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  project_name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface ApiError {
  detail: string;
}

// Phase 2: Requirements Types
export interface AttributeDefinition {
  name: string;
  type: string;
  primary_key: boolean;
  foreign_key: boolean;
  references?: string | null;
  nullable: boolean;
  unique: boolean;
  default_value?: string | null;
  description?: string | null;
}

export interface EntityDefinition {
  name: string;
  description?: string | null;
  attributes: AttributeDefinition[];
}

export interface RelationshipDefinition {
  source_entity: string;
  target_entity: string;
  relationship_type: 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_MANY' | string;
  foreign_key_column?: string | null;
  junction_table?: string | null;
  description?: string | null;
}

export interface ConstraintDefinition {
  entity: string;
  type: 'PRIMARY_KEY' | 'FOREIGN_KEY' | 'UNIQUE' | 'NOT_NULL' | 'CHECK' | string;
  columns: string[];
  details?: string | null;
}

export interface AnalyzedRequirement {
  summary?: string | null;
  entities: EntityDefinition[];
  relationships: RelationshipDefinition[];
  constraints: ConstraintDefinition[];
  business_rules: string[];
}

export interface Requirement {
  id: string;
  project_id: string;
  original_text: string;
  analyzed_data: AnalyzedRequirement;
  created_at: string;
  updated_at: string;
}

// Phase 3: Schema Design Types
export interface ColumnDesign {
  name: string;
  data_type: string;
  primary_key: boolean;
  foreign_key: boolean;
  references_table?: string | null;
  references_column?: string | null;
  nullable: boolean;
  unique: boolean;
  default?: string | null;
  check_constraint?: string | null;
  description?: string | null;
}

export interface TableDesign {
  name: string;
  description?: string | null;
  is_junction_table: boolean;
  columns: ColumnDesign[];
  primary_key: string[];
  indexes: string[];
}

export interface RelationshipDesign {
  from_table: string;
  to_table: string;
  cardinality: 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_MANY' | string;
  foreign_key_column?: string | null;
  references_column?: string | null;
  junction_table?: string | null;
  on_delete: string;
  on_update: string;
  description?: string | null;
}

export interface SchemaImprovement {
  category: 'NORMALIZATION' | 'INDEXING' | 'DATA_INTEGRITY' | 'PERFORMANCE' | string;
  title: string;
  description: string;
  severity: 'SUGGESTION' | 'LOW' | 'MEDIUM' | 'HIGH' | string;
}

export interface NormalizationReport {
  first_normal_form: boolean;
  second_normal_form: boolean;
  third_normal_form: boolean;
  issues_found: string[];
  detected_duplicate_attributes: string[];
}

export interface CompleteSchemaDefinition {
  schema_name: string;
  summary?: string | null;
  tables: TableDesign[];
  relationships: RelationshipDesign[];
  normalization_report: NormalizationReport;
  improvements: SchemaImprovement[];
  mermaid_er: string;
}

export interface SchemaRecord {
  id: string;
  project_id: string;
  schema_name: string;
  database_dialect: string;
  version: number;
  schema_definition: CompleteSchemaDefinition;
  mermaid_er?: string | null;
  created_at: string;
  updated_at: string;
}

// Phase 4: SQL Generation & Validation Types
export interface SQLValidationError {
  message: string;
  severity: 'ERROR' | 'WARNING' | string;
  table?: string | null;
  column?: string | null;
  line?: number | null;
  rule?: string | null;
}

export interface SQLValidationResult {
  is_valid: boolean;
  syntax_valid: boolean;
  design_valid: boolean;
  dialect: string;
  errors: SQLValidationError[];
  warnings: SQLValidationError[];
  suggested_corrections: string[];
  tables_validated: string[];
  total_statements: number;
}

export interface SQLGenerateResponse {
  schema_id: string;
  database_dialect: string;
  generated_sql: string;
  validation_result: SQLValidationResult;
  table_count: number;
  statement_count: number;
}

// Phase 5: Database Migration & Version Control Types
export interface SchemaDiffItem {
  change_type: 'TABLE_ADDED' | 'TABLE_DROPPED' | 'COLUMN_ADDED' | 'COLUMN_DROPPED' | 'COLUMN_MODIFIED' | string;
  table_name: string;
  column_name?: string | null;
  details: string;
  is_destructive: boolean;
  old_value?: string | null;
  new_value?: string | null;
}

export interface SchemaDiffReport {
  has_changes: boolean;
  risk_level: 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'DESTRUCTIVE' | string;
  data_loss_warnings: string[];
  differences: SchemaDiffItem[];
  tables_added: string[];
  tables_dropped: string[];
  columns_added: string[];
  columns_dropped: string[];
  columns_modified: string[];
}

export interface MigrationHistoryRecord {
  id: string;
  version: number;
  execution_status: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK' | string;
  executed_by: string;
  execution_timestamp: string;
  error_message?: string | null;
}

export interface MigrationRecord {
  id: string;
  project_id: string;
  source_schema_id?: string | null;
  target_schema_id: string;
  database_dialect: string;
  migration_sql: string;
  rollback_sql: string;
  status: 'PENDING' | 'APPROVED' | 'EXECUTED' | 'REJECTED' | 'ROLLED_BACK' | string;
  risk_level: 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'DESTRUCTIVE' | string;
  detected_diff: SchemaDiffReport;
  created_at: string;
  executed_at?: string | null;
  history: MigrationHistoryRecord[];
}

// Phase 6: Multi-Agent Orchestration Types
export type AgentWorkflowStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'AWAITING_HUMAN_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED'
  | 'FAILED';

export interface WorkflowStepLog {
  step: string;
  agent: string;
  status: string;
  timestamp: string;
  summary: string;
  details?: Record<string, any>;
}

export interface WorkflowStatusResponse {
  id: string;
  project_id: string;
  status: AgentWorkflowStatus;
  current_step: string;
  dialect: string;
  requirements_text: string;
  human_approval_required: boolean;
  is_approved?: boolean | null;
  approved_by?: string | null;
  approval_notes?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  steps_history: WorkflowStepLog[];
  analyzed_requirements?: AnalyzedRequirement | null;
  designed_schema?: CompleteSchemaDefinition | null;
  generated_sql?: string | null;
  validation_result?: SQLValidationResult | null;
  review_report?: {
    architecture_rating: string;
    risk_level: string;
    destructive_changes_count: number;
    data_loss_warnings: string[];
    review_findings: string[];
    tables_added: string[];
    tables_dropped: string[];
    columns_added: string[];
    columns_dropped: string[];
    columns_modified: string[];
  } | null;
  diff_report?: SchemaDiffReport | null;
  migration_sql?: string | null;
  rollback_sql?: string | null;
  risk_level?: string | null;
  error_message?: string | null;
}

export interface WorkflowRunRequest {
  project_id: string;
  requirements_text: string;
  dialect?: string;
  baseline_schema_id?: string | null;
  auto_apply_if_safe?: boolean;
}

export interface WorkflowApproveRequest {
  approved: boolean;
  notes?: string | null;
  apply_migration?: boolean;
}

