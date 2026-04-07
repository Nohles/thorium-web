import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/read/experimental/$identifier")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/read/$identifier",
      params: { identifier: params.identifier },
    });
  },
});
