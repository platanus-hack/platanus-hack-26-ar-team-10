const proofBeats = [
  {
    status: "FAIL missing-authz",
    title: "Agent creates public admin route",
    detail: "Unauthenticated GET /admin/users returns 200 on the vulnerable runtime.",
  },
  {
    status: "CONTRACT created",
    title: "Observable safety contract",
    detail: "Unauthenticated request must receive 401 or 403.",
  },
  {
    status: "REPLAY baseline got 200",
    title: "Counterexample reproduced",
    detail: "The same JSON replay proves the unsafe baseline is actually reachable.",
  },
  {
    status: "FIX applied",
    title: "Auth middleware added",
    detail: "The agent can patch the route, but the model does not get to declare victory.",
  },
  {
    status: "REPLAY fixed got 401",
    title: "Same replay, fixed runtime",
    detail: "The oracle reruns the unauthenticated request and observes denial.",
  },
  {
    status: "PASS scoped acceptance",
    title: "Accepted only for this route",
    detail: "Baseline fail plus fixed pass creates evidence for this route and replay.",
  },
];

export function OracleDemoFlow() {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {proofBeats.map((beat, index) => (
        <article
          key={beat.status}
          className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm shadow-zinc-950/[0.03]"
        >
          <div className="flex items-start justify-between gap-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
              {beat.status}
            </p>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              {String(index + 1).padStart(2, "0")}
            </span>
          </div>
          <h2 className="mt-4 text-xl font-semibold leading-tight text-zinc-950">
            {beat.title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            {beat.detail}
          </p>
        </article>
      ))}
    </div>
  );
}
