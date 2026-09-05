# VortexFlow GUI (`vortexflow-gui`)

Desktop graphical user interface for VortexFlow, built with **Electron**, **React 19**, **TypeScript**, **Tailwind CSS v4**, and **@xyflow/react**.

## Overview

`vortexflow-gui` provides an interactive bioinformatics workbench for composing, validating, and monitoring genomic pipelines. It communicates with the local `vortexflow-server` over REST and Server-Sent Events (SSE).

## Features

- **Pipeline Canvas**: Drag-and-drop node graph builder with Dagre auto-layout, custom handles, and cycle prevention.
- **Node Palette**: Docked, searchable library of bioinformatics tools categorized by function.
- **Parameters Inspector**: Langflow-style parameters drawer with off-screen click dismissal and smooth animations.
- **NCBI Explorer**: Integrated Entrez query engine for SRA, BioProject, and Assembly databases.
- **Live Terminal Console**: Real-time SSE streaming for live pipeline output and execution logs.
- **Analysis Visualizers**: Recharts-powered interactive QC charts and antibiogram resistance matrices.
- **Theming**: Dark and light mode support with modern typography and sleek glassmorphism accents.

## Development

Install dependencies:

```bash
npm install
```

Start the Vite development server standalone:

```bash
npm run dev
```

Start both the backend server and Electron desktop shell concurrently:

```bash
npm run electron:dev
```

Type checking and linting:

```bash
npm run typecheck
npm run lint
```

Production build:

```bash
npm run build
```
