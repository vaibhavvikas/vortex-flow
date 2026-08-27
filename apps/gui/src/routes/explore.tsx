import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/explore")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/explore" || location.pathname === "/explore/") {
      throw redirect({ to: "/explore/search" })
    }
  },
  component: () => <Outlet />,
})
