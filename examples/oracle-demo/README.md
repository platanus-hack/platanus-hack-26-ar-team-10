# yieldOS Oracle Demo Fixture

This directory contains the intentionally vulnerable `missing-auth` demo fixture used by `yieldos-oracle-demo`.

It is a development and proof fixture, not production plugin runtime. The packaged plugin ships oracle contracts and runnable oracle commands, while this vulnerable sample stays under `examples/` so users do not install demo application code as part of the default runtime surface.

To run it from the repository:

```sh
yieldOS/plugins/yieldos/bin/yieldos-oracle-demo missing-auth
```

When running from a packaged plugin, set `YIELDOS_ORACLE_DEMO_FIXTURE_ROOT` to this `fixture/` directory if you intentionally want to replay the demo.
