export interface ColumnDefinition {
  name: string;
  type: string;
  nullable?: boolean;
  default_value?: string;
  primary_key?: boolean;
  unique?: boolean;
  references?: { table: string; column: string };
}

export interface IndexDefinition {
  name: string;
  columns: string[];
  unique?: boolean;
}

export interface SchemaOperation {
  operation: "create_table" | "alter_table" | "drop_table";
  table: string;
  display_name?: string;
  description?: string;
  template_id?: string;
  columns?: ColumnDefinition[];
  indexes?: IndexDefinition[];
  add_columns?: ColumnDefinition[];
  drop_columns?: string[];
  seed_data?: Record<string, unknown>[];
}

export interface TableRegistryEntry {
  id: string;
  table_name: string;
  display_name: string;
  description: string | null;
  category: "system" | "custom";
  template_id: string | null;
  columns: ColumnDefinition[];
  indexes: IndexDefinition[];
  created_at: string;
  updated_at: string;
}

export interface TableRow {
  [key: string]: unknown;
}

export interface TableInfo {
  name: string;
  display_name: string;
  description: string | null;
  category: "system" | "custom" | "free";
  row_count: number;
  columns: ColumnDefinition[];
}
