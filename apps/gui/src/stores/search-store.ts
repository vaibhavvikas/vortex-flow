import { create } from "zustand"
import type { RowSelectionState, VisibilityState } from "@tanstack/react-table"

interface SearchStore {
  activeQuery: string
  activeDb: string
  page: number
  searchRowSelection: RowSelectionState
  collectionRowSelection: RowSelectionState
  searchColumnVisibility: VisibilityState
  collectionColumnVisibility: VisibilityState
  submitSearch: (query: string, db?: string) => void
  setPage: (updater: number | ((prev: number) => number)) => void
  setSearchRowSelection: (
    updater: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)
  ) => void
  setCollectionRowSelection: (
    updater: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)
  ) => void
  setSearchColumnVisibility: (
    updater: VisibilityState | ((prev: VisibilityState) => VisibilityState)
  ) => void
  setCollectionColumnVisibility: (
    updater: VisibilityState | ((prev: VisibilityState) => VisibilityState)
  ) => void
  resetSearch: () => void
}

export const useSearchStore = create<SearchStore>((set) => ({
  activeQuery: "",
  activeDb: "sra",
  page: 1,
  searchRowSelection: {},
  collectionRowSelection: {},
  searchColumnVisibility: {},
  collectionColumnVisibility: {},

  submitSearch: (query, db = "sra") =>
    set({
      activeQuery: query.trim(),
      activeDb: db,
      page: 1,
      searchRowSelection: {},
    }),
  setPage: (updater) =>
    set((state) => ({
      page: typeof updater === "function" ? updater(state.page) : updater,
      searchRowSelection: {},
    })),
  setSearchRowSelection: (updater) =>
    set((state) => ({
      searchRowSelection:
        typeof updater === "function"
          ? updater(state.searchRowSelection)
          : updater,
    })),
  setCollectionRowSelection: (updater) =>
    set((state) => ({
      collectionRowSelection:
        typeof updater === "function"
          ? updater(state.collectionRowSelection)
          : updater,
    })),
  setSearchColumnVisibility: (updater) =>
    set((state) => ({
      searchColumnVisibility:
        typeof updater === "function"
          ? updater(state.searchColumnVisibility)
          : updater,
    })),
  setCollectionColumnVisibility: (updater) =>
    set((state) => ({
      collectionColumnVisibility:
        typeof updater === "function"
          ? updater(state.collectionColumnVisibility)
          : updater,
    })),
  resetSearch: () =>
    set({
      activeQuery: "",
      page: 1,
      searchRowSelection: {},
    }),
}))
