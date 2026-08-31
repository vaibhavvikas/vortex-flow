# Plugin Manifest Schema & Execution Engine Specification

This document defines the formal specification for VortexFlow plugin manifests, data socket contracts, command-line argument injection rules, and built-in core nodes.

---

## 1. Overview & Architecture

VortexFlow employs a modular node graph execution architecture. Tools and analytical routines are declared in JSON manifests (`manifests/*.json`). Each manifest registers:
- **Package Installation (`install`)**: Environment provisioning via Rattler (Conda/Bioconda), Pip, or binary archive.
- **Reference Databases (`databases`)**: Git repositories or compressed archive dependencies required by the tool.
- **Specialized Nodes (`nodes`)**: One or more nodes (Executors, Parsers, Transformers, Viewers) imported into the canvas palette.

---

## 2. Structured Data Sockets

Data sockets define connectable input and output ports between nodes.

### 2.1 Output Socket (`SocketType`)
Every output port declares exactly one concrete `SocketType`:

```json
// Folder output
{
  "kind": "folder",
  "schema": "resfinder_output_folder"
}

// File output
{
  "kind": "file",
  "format": "tsv",
  "schema": "amr_genes"
}
```

- **`kind`** (`"folder"` | `"file"`): The structural nature of the artifact.
- **`format`** (`string`): Required on `file` variants (e.g. `"tsv"`, `"csv"`, `"fasta"`, `"json"`, `"html"`). Must use the blessed vocabulary table.
- **`schema`** (`string`, optional): A domain-specific semantic identifier indicating internal structure or column layout (e.g. `"amr_genes"`, `"resfinder_output_folder"`).

### 2.2 Input Port Matchers (`accepted_types`)
Input ports declare a list of acceptable matchers (`accepted_types`). Every field on a `SocketMatcher` is optional-as-wildcard (`None` = matches anything):

```json
// Accepts any TSV file (ignores schema)
{
  "accepted_types": [
    { "kind": "file", "format": "tsv" }
  ]
}

// Accepts any file (any format, any schema)
{
  "accepted_types": [
    { "kind": "file" }
  ]
}

// Accepts anything (any file or folder)
{
  "accepted_types": [{}]
}

// Accepts specifically a ResFinder output folder
{
  "accepted_types": [
    { "kind": "folder", "schema": "resfinder_output_folder" }
  ]
}
```

### 2.3 Socket Matching Algorithm
An edge connection from an `OutputPort` to an `InputPort` is valid if the output's `SocketType` satisfies **at least one** `SocketMatcher` in `accepted_types`:
1. If matcher's `kind` is specified, it must equal the producer's kind exactly.
2. If matcher's `format` is specified, producer must be a `File` with an identical `format`.
3. If matcher's `schema` is `Some(s)`, producer's `schema` must equal `Some(s)` exactly.
4. If matcher's field is omitted/`None`, any producer value for that field matches.

### 2.4 File-Based Execution Guarantee
All analytical outputs and inter-node data handoffs are written to disk as real files. Parsers and executors run as isolated subprocesses with individual working directories. Viewers execute no subprocesses and read computed file artifacts over HTTP for client-side visualization.

---

## 3. Blessed File Formats Vocabulary Table

To guarantee interoperability between independent plugins, authors must strictly reuse format strings from this blessed table. Never invent custom variations (e.g. no `tsv_file`, `tab_separated`, `tsv2`).

| Format String | Description | Typical Extension | Example Manifest Output |
| :--- | :--- | :--- | :--- |
| `tsv` | Tab-separated tabular data | `.tsv`, `.txt` | `resfinder_runner.results_tab` |
| `csv` | Comma-separated tabular data | `.csv` | `sample_table` |
| `xlsx` | Microsoft Excel spreadsheet | `.xlsx` | `summary_report` |
| `json` | Structured JSON data payload | `.json` | `resfinder_pheno_parser.amr_genes` |
| `fasta` | Nucleotide or amino acid sequences | `.fasta`, `.fa`, `.fsa`, `.fna` | `resfinder_runner.hit_seqs` |
| `fastq` | Sequencing reads with quality scores | `.fastq`, `.fq`, `.fastq.gz` | `folder_input.sequence_files` |
| `html` | Standalone interactive HTML report | `.html` | `fastqc_runner.qc_html` |
| `bam` | Binary alignment map | `.bam` | `bwa_mem.alignment_bam` |
| `vcf` | Variant call format | `.vcf`, `.vcf.gz` | `snippy.variants_vcf` |
| `image` | PNG, JPEG, or SVG graphic | `.png`, `.svg`, `.jpg` | `coverage_plot` |
| `binary` | Arbitrary compiled binary / archive | `.bin`, `.tar.gz`, `.zip` | `archive_export` |

---

## 4. Blessed Core Schemas

| Schema | Format | Description | Standard Producer | Standard Consumer |
| :--- | :--- | :--- | :--- | :--- |
| `core.sequence_folder` | `folder` | Local directory of sequencing reads | `core.folder_input` | `resfinder_runner`, `fastqc_runner` |
| `core.tabular_data` | `json` | Normalized column-oriented table payload | `core.column_selector` | `core.chart_viewer` |

### `core.tabular_data` JSON Specification:
```json
{
  "schema": "core.tabular_data",
  "row_count": 2,
  "columns": [
    {
      "name": "gene",
      "values": ["blaTEM-1B", "tet(A)"]
    },
    {
      "name": "identity",
      "values": [100.0, 98.4]
    }
  ]
}
```

---

## 5. CLI-Flag Auto-Injection Rules (`build_argv`)

The execution engine constructs command line arguments (`argv`) according to this strict, deterministic order:

1. **Args Template Interpolation**:
   - `{work_dir}` / `{output_dir}`: Substituted with the node's isolated execution directory.
   - `{input_files}` / `{<input_port_id>}`: Substituted with resolved upstream input path(s).
   - `{<param_id>}`: Substituted with the parameter's configured value (or default). If a boolean parameter is true, its `cli_flag` is substituted; if false, omitted. If optional and empty, preceding single-dash flags in paired templates (e.g. `["-s", "{species}"]`) are dropped.
   - Explicitly referenced parameters and databases are recorded to avoid double injection.
2. **Auto-Append Active Parameters**:
   - Any parameter **not** explicitly referenced in `args_template` is evaluated:
     - **Boolean parameters**: If resolved value is `true`, `cli_flag` (or `--<param_id>`) is appended. Never appended if `false`.
     - **Non-boolean parameters**: If `cli_flag` is present and value is non-empty, `cli_flag` followed by the value is appended.
3. **Auto-Append Required Databases**:
   - Each database in `databases` is appended as `<cli_flag> <resolved_db_path>` **only if**:
     - The database `name` is declared in the executor's `execution.requires_databases` array.
     - The database was not explicitly referenced in `args_template`.
     - The database exists locally on disk.

---

## 6. Validation Rules (`validation`)

Validation rules are declared as an array of structured rule objects:

```json
"validation": [
  {
    "rule": "require_at_least_one",
    "params": ["acquired", "point"],
    "error_message": "At least one target ('Scan Acquired AMR' or 'Scan Point Mutations') must be checked."
  }
]
```

The engine validates all rules before execution, collecting all failures into a unified error report.

---

## 7. Auto-Namespacing & Identifier Rules

To prevent collisions between plugins:
1. **Node IDs**: The loader automatically prefixes every `node.id` with `<plugin_id>.` at load time (e.g. `resfinder_runner` under plugin `resfinder` becomes `resfinder.resfinder_runner`).
2. **Schema Strings**: All socket `schema` strings are automatically prefixed with `<plugin_id>.` unless already prefixed with `core.`.
3. **Core Namespace (`core`)**: Reserved exclusively for built-in nodes (`core.folder_input`, `core.output_save`, `core.column_selector`, `core.chart_viewer`). Plugins attempting to register under `id: "core"` are rejected.
4. **Reserved Placeholders**: Parameter IDs cannot shadow engine placeholders (`work_dir`, `input_files`, `output_dir`, `databases`, `env_path`).

---

## 8. Execution Contract for Node Types

| Node Type | `execution` Block | Subprocess Spawned | Responsibility |
| :--- | :--- | :--- | :--- |
| `executor` | **Required** | Yes | Runs CLI binary or script on raw sequence data |
| `parser` | **Required** | Yes | Parses output folder / raw report files into structured JSON files |
| `transformer` | **Required** | Yes | Filters, merges, or transforms datasets |
| `viewer` | **Forbidden / Omitted** | No | Renders client-side visualization cards from already computed input files |

---

## 9. Dynamic Parameter Widgets: `column_select`

For data transformation and visualization bridging, parameter definitions support the `column_select` type:

```json
{
  "id": "selected_columns",
  "name": "Selected Columns",
  "type": "column_select",
  "input_id": "table_file",
  "multiple": true,
  "description": "Pick columns to extract from input table"
}
```

The backend exposes `POST /api/workflow/peek-columns` to read headers from TSV, CSV, or XLSX files before workflow execution, populating dropdowns and multi-select tags dynamically in the UI.
