export function TitleBar() {
  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent)

  return (
    <header
      className={`flex h-9 shrink-0 items-center justify-center border-b border-border bg-background px-4 select-none relative z-20 [app-region:drag] ${
        isMac ? "pl-[78px]" : "pr-[135px]"
      }`}
    >
      <div className="text-xs font-medium text-muted-foreground truncate pointer-events-none">
        VortexFlow — WGS Pipeline v2.4
      </div>
    </header>
  )
}
