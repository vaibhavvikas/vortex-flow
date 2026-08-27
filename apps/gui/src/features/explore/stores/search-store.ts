import { create } from "zustand"
import type { RowSelectionState, VisibilityState } from "@tanstack/react-table"
import type { SraRecord } from "../services/sra-service"

interface SearchStore {
  activeQuery: string
  activeDb: string
  page: number
  searchRowSelection: RowSelectionState
  collectionRowSelection: RowSelectionState
  searchColumnVisibility: VisibilityState
  collectionColumnVisibility: VisibilityState

  // Inspector state
  selectedRecord: { record: SraRecord; db: string } | null
  isInspectorOpen: boolean

  submitSearch: (query: string, db?: string) => void
  setActiveDb: (db: string) => void
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
  setSelectedRecord: (record: SraRecord | null, db?: string) => void
  setIsInspectorOpen: (isOpen: boolean) => void
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
  selectedRecord: null,
  isInspectorOpen: false,

  submitSearch: (query, db) =>
    set((state) => ({
      activeQuery: query.trim(),
      activeDb: db || state.activeDb,
      page: 1,
      searchRowSelection: {},
    })),
  setActiveDb: (db) =>
    set((state) => {
      if (state.activeDb === db) return state
      return {
        activeDb: db,
        page: 1,
        searchRowSelection: {},
      }
    }),
  setPage: (updater) =>
    set((state) => {
      const nextPage = typeof updater === "function" ? updater(state.page) : updater
      if (state.page === nextPage) return state
      return {
        page: nextPage,
        searchRowSelection: {},
      }
    }),
  setSearchRowSelection: (updater) =>
    set((state) => {
      const next = typeof updater === "function" ? updater(state.searchRowSelection) : updater
      if (JSON.stringify(next) === JSON.stringify(state.searchRowSelection)) return state
      return { searchRowSelection: next }
    }),
  setCollectionRowSelection: (updater) =>
    set((state) => {
      const next = typeof updater === "function" ? updater(state.collectionRowSelection) : updater
      if (JSON.stringify(next) === JSON.stringify(state.collectionRowSelection)) return state
      return { collectionRowSelection: next }
    }),
  setSearchColumnVisibility: (updater) =>
    set((state) => {
      const next = typeof updater === "function" ? updater(state.searchColumnVisibility) : updater
      if (JSON.stringify(next) === JSON.stringify(state.searchColumnVisibility)) return state
      return { searchColumnVisibility: next }
    }),
  setCollectionColumnVisibility: (updater) =>
    set((state) => {
      const next = typeof updater === "function" ? updater(state.collectionColumnVisibility) : updater
      if (JSON.stringify(next) === JSON.stringify(state.collectionColumnVisibility)) return state
      return { collectionColumnVisibility: next }
    }),
  setSelectedRecord: (record, db = "sra") =>
    set((state) => {
      const nextSelected = record ? { record, db } : null
      if (state.selectedRecord === null && nextSelected === null && !state.isInspectorOpen) {
        return state
      }
      if (
        state.selectedRecord?.record.id === record?.id &&
        state.selectedRecord?.db === db &&
        state.isInspectorOpen === !!record
      ) {
        return state
      }
      return {
        selectedRecord: nextSelected,
        isInspectorOpen: !!record,
      }
    }),
  setIsInspectorOpen: (isOpen) =>
    set((state) => {
      if (state.isInspectorOpen === isOpen) return state
      return { isInspectorOpen: isOpen }
    }),
  resetSearch: () =>
    set((state) => {
      if (state.activeQuery === "" && state.page === 1 && Object.keys(state.searchRowSelection).length === 0) {
        return state
      }
      return {
        activeQuery: "",
        page: 1,
        searchRowSelection: {},
      }
    }),
}))
