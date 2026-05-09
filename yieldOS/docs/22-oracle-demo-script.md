# Oracle Demo Script

Run the proof demo:

```bash
yieldos-oracle-demo missing-auth
```

The demo creates a temporary project, starts a trusted vulnerable local fixture runtime, replays an unauthenticated `GET /admin/users`, observes `200`, starts the fixed fixture runtime, replays the same request, observes `401`, and writes a proof manifest.

Expected beats:

1. `FAIL missing-authz`
2. `CONTRACT created`
3. `REPLAY baseline got 200`
4. `FIX applied`
5. `REPLAY fixed got 401`
6. `PASS scoped acceptance`

This proves this route and replay only, not the whole repo.
