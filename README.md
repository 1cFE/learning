# Fusion learning dashboard

Interactive supplement for the compact learning corridor post at [1cf.energy](https://1cf.energy). Repository: [1cFE/learning](https://github.com/1cFE/learning). The production address is `https://learning.1cf.energy/`. Use `https://learning.1cf.energy/v10/` in the article to retain its original model and defaults.

The six primary controls are separate compact and large first-unit costs, a shared learning rate, a shared fixed cost contribution, and each design's limited early demand. Additional assumptions are under “Other assumptions”. The calculation is hypothetical and keeps new-order prices, cohort delivery dates and lifetime premium commitments distinct.

## Build and verify

Requires Python 3.10 or newer and Node 18 or newer. No package installation is needed.

```sh
python3 build.py
```

The build runs the numerical tests before generating `public/index.html`, a self-contained offline page. The tests compare 13 independently generated Python reference paths, then cover edge cases and randomized invariants. `NODE` can select a Node executable if it is not on `PATH`.

```sh
python3 -m http.server 8000 --directory public
```

Open `http://localhost:8000`. The deployed directory is `public/`. It contains no private research, draft manuscript, account credentials or external runtime dependencies.

## Files

- `src/interface.html`, `src/view.js` and `src/base.css`: controls and chart presentation.
- `src/model.js`: numerical model used by the browser.
- `scripts/four_case_trajectory.py`: independent reference implementation. The build imports its results through a fixture and does not run its optional plotting code.
- `src/model-test.cjs` and `src/model-fixture.json`: parity tests and reference results.
- `src/generate-model-fixture.py`: regenerates the fixture from the bundled Python source using only the standard library.
- `src/model-notes.html`: public explanation of the assumptions and source.
- `public/v10/`: frozen article snapshot. Normal builds verify its checksums and never overwrite it.

Change source files and run the build before committing. Commit generated `public/` files as well so the article snapshot and deployment output remain reviewable. The GitHub check rejects generated output that does not match source.

Regenerate a reference fixture only when the independent reference calculation intentionally changes:

```sh
python3 src/generate-model-fixture.py
python3 build.py
```

The current interactive extensions, including raised early-demand limits, are documented in `src/MODEL-API.md`. They preserve all default reference paths.

## Cloudflare Workers deployment

The dashboard runs on Cloudflare Workers Static Assets. The `1cfe-learning` Worker is connected to this repository through Workers Builds. Pushes to `main` build and deploy the site with these settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Build command | `python3 build.py` |
| Deploy command | `npx wrangler deploy` |
| Static assets directory | `public` |
| Root directory | Repository root |

`wrangler.jsonc` records the Worker name, static assets directory and `learning.1cf.energy` custom domain. Cloudflare manages the domain's DNS record and HTTPS certificate. No application server or separate Worker script is required.

The public dashboard is at <https://learning.1cf.energy/>. The article version is at <https://learning.1cf.energy/v10/>. Both URLs were verified over HTTPS on 29 September 2026.

## Versioning

The first v10 snapshot was created once with `python3 build.py --freeze-v10`. The command refuses to replace it. New scientific assumptions should get a new versioned path and snapshot rather than altering the article's published calculation. The root dashboard can later advance while `/v10/` stays fixed.

## License

The original code and documentation in this repository are licensed under the [MIT License](LICENSE), copyright 2026 Astera Institute.

Bundled D3 v7.9.0 retains its [ISC license](src/vendor/D3-LICENSE.txt), copyright 2010–2023 Mike Bostock. Its license notices are also included in `public/D3-LICENSE.txt` and `public/v10/D3-LICENSE.txt`.
