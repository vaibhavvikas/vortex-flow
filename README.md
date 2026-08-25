# VortexFlow

A visual, node-based pipeline builder for bacterial genomics.

## Workspace Architecture

VortexFlow is structured as a Rust cargo workspace divided into applications (`apps/`) and core modular crates (`crates/`).

### Applications (`apps/`)

- `vortexflow-cli` (`apps/cli`): Command Line Interface for pipeline execution and automation.
- `vortexflow-gui` (`apps/gui`): Graphical User Interface desktop application.
- `vortexflow-server` (`apps/server`): Backend server service.

### Core Crates (`crates/`)

- `vortexflow-types` (`crates/types`): Core data models and primitive definitions.
- `vortexflow-graph` (`crates/graph`): Pipeline DAG structure and graph operations.
- `vortexflow-resolve` (`crates/resolve`): Package and dependency resolution engine.
- `vortexflow-engine` (`crates/engine`): Execution engine core.
- `vortexflow-storage` (`crates/storage`): Storage management and persistence layer.
- `vortexflow-identity` (`crates/identity`): Authentication and identity management.
- `vortexflow-providers` (`crates/providers`): External genomic data provider integrations (NCBI Entrez, ENA, Ensembl).

## Development

Check and build all workspace members:

```bash
cargo check
cargo test
```