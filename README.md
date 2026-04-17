# Stratos Screenshots Plugin

Watches folders on disk for new screenshots, tags each one with live flight
telemetry, and attaches them to the pilot's PIREP for the currently-tracked
flight.

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [VA backend contract](#va-backend-contract)
- [Plugin API surface](#plugin-api-surface)
- [Settings](#settings)
- [Development](#development)
- [About Skyvex Software](#about-skyvex-software)
- [License](#license)

---

## Features

- **Folder watching** with debounced write-stability and baselining of
  pre-existing files.
- **Live telemetry tagging** — phase, altitude, speed, heading, position,
  callsign, route, and elapsed time stamped onto every capture.
- **Flight-bound attachments** — the "Attached" badge only shows when the
  attachment matches the *current* flight.
- **"New only" gate** (default on) hides pre-existing captures so a fresh
  flight starts clean.
- **Auto-attach** opt-in — captures upload the moment they're tagged.
- **Lightbox** with expandable telemetry panel.

---

## Architecture

```
src/
├── background/         # Node main process — runs in the Stratos shell
│   ├── index.ts        # Plugin entry (onStart / onStop)
│   ├── watcher.ts      # fs.watch + debounce
│   ├── routes.ts       # Express router for the UI
│   ├── store.ts        # Persisted state via PluginConfigStore
│   ├── telemetry.ts    # Captures sim/phase/flight snapshot per shot
│   └── attach.ts       # Multipart upload to the VA backend
├── ui/                 # Renderer (React 19 + Vite)
└── shared/             # Types + protocol constants
```

The UI polls `/api/screenshots/screenshots` every ~2.5s. Mutations also call
`refresh()` directly so the pane updates immediately.

---

## VA backend contract

The plugin calls the airline's API directly (no shell-side proxy). It reads
the VA base URL and bearer from the SDK's airline accessor. `airline.baseUrl`
is the airline's Stratos endpoint root (it already includes the `/api/stratos`
prefix or whatever path the airline mounts under), so the plugin appends only
the leaf route:

```ts
const airline = await ctx.airline.getCurrent();
fetch(`${airline.baseUrl}/screenshot/upload`, {
  method: "POST",
  headers: { Authorization: `Bearer ${airline.token}` },
  body: form,
});
```

The VA only needs to expose the two routes below.

### Routes

Mount under `api/stratos`, behind your auth guard:

| Method   | Path                   | Purpose                                   |
| -------- | ---------------------- | ----------------------------------------- |
| `POST`   | `/screenshot/upload`   | Persist a multipart upload against a bid  |
| `DELETE` | `/screenshot/delete`   | Delete a media row the authed pilot owns  |

### `POST /screenshot/upload`

Multipart fields:

| Field         | Type              | Required | Notes                                       |
| ------------- | ----------------- | -------- | ------------------------------------------- |
| `file`        | file              | yes      | Image, max ~10 MB (PNG / JPEG / BMP / WEBP) |
| `bid_id`      | string \| integer | yes      | Pilot's bid; numeric or opaque string       |
| `flight_data` | string            | no       | JSON-stringified telemetry blob             |

Response body must include a `photo_id` UUID identifying the new row:

```json
{ "photo_id": "0193f2a4-7b51-7a7e-9f0c-2a8a3a5b1234" }
```

The plugin stores that UUID against the screenshot. When the user later
deletes the screenshot, the same UUID is sent to `DELETE /screenshot/delete`
so the VA can match and remove the row.

`flight_data` shape (persist as-is, e.g. on a JSON column):

```jsonc
{
  "capturedAt": 1730420115234,
  "hasSimConnection": true,
  "phase": "CRUISE",
  "latitude": -33.9461,
  "longitude": 151.1772,
  "altitudeFt": 36000,
  "groundSpeedKt": 462,
  "headingDeg": 271,
  "aircraftIcao": "B738",
  "flight": {
    "callsign": "QFA123",
    "departureIcao": "YSSY",
    "arrivalIcao": "YMML",
    "elapsedMs": 1843200
  }
}
```

### `DELETE /screenshot/delete?photo_id=<uuid>`

Deletes a row the authed pilot owns by the UUID returned from upload. Server
should treat unknown IDs as a no-op success (idempotent).

### Reference implementation (vanilla Laravel)

```php
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

public function upload(Request $request)
{
    $validated = $request->validate([
        'file' => ['required', 'image', 'max:10240'],
        'bid_id' => ['required', 'string'],
        'flight_data' => ['sometimes', 'string'],
    ]);

    $path = $request->file('file')->storeAs(
        'screenshots/'.Auth::id(),
        $request->file('file')->hashName(),
        'public',
    );

    $photoId = (string) Str::uuid();

    PirepScreenshot::create([
        'photo_id' => $photoId,
        'pilot_id' => Auth::id(),
        'bid_id' => $validated['bid_id'],
        'path' => $path,
        'flight_data' => json_decode($validated['flight_data'] ?? '{}', true),
    ]);

    return response()->json(['photo_id' => $photoId]);
}

public function delete(Request $request)
{
    $validated = $request->validate(['photo_id' => ['required', 'uuid']]);

    PirepScreenshot::query()
        ->where('photo_id', $validated['photo_id'])
        ->where('pilot_id', Auth::id())
        ->delete();

    return response()->json(['ok' => true]);
}
```

```php
Route::middleware('auth:api')->prefix('api/stratos/screenshot')->group(function () {
    Route::post('upload', [ScreenshotController::class, 'upload']);
    Route::delete('delete', [ScreenshotController::class, 'delete']);
});
```

---

## Plugin API surface

Local routes mounted at `/api/screenshots`:

| Method   | Path                       | Purpose                              |
| -------- | -------------------------- | ------------------------------------ |
| `GET`    | `/folders`                 | List watched folders + state         |
| `POST`   | `/folders/pick`            | Native folder picker → watch         |
| `DELETE` | `/folders?path=<encoded>`  | Stop watching a folder               |
| `GET`    | `/screenshots`             | List all known screenshots           |
| `POST`   | `/screenshots/:id/attach`  | Upload to VA via the proxy           |
| `POST`   | `/screenshots/:id/reveal`  | `shell.showItemInFolder()` the file  |
| `DELETE` | `/screenshots/:id`         | Forget the screenshot                |
| `GET`    | `/file/:id`                | Stream the raw image bytes           |

Socket channels (auto-prefixed `plugin:screenshots:`):

- `screenshots:updated` — full screenshot list, fired on any mutation
- `folders:updated` — full folder list, fired on add/remove/state changes

---

## Settings

| Key          | Type    | Scope | Default | Description                                   |
| ------------ | ------- | ----- | ------- | --------------------------------------------- |
| `autoAttach` | boolean | user  | `false` | Attach each screenshot the moment it's tagged |

---

## Development

```bash
pnpm install
pnpm dev          # Vite dev server for the UI
pnpm build        # Build UI + background bundles
pnpm bundle       # Build + run stratos-deploy to package the plugin
```

Just needs Stratos running locally — the plugin auto-discovers the dev
server's port from the shell.

---

## About Skyvex Software

[Skyvex Software](https://skyvexsoftware.com) builds Stratos — the desktop
companion app that bridges flight simulators with virtual airline backends,
hosting a plugin runtime so VAs and third parties can ship pilot tools that
share one app, one auth session, and one source of flight truth.

- Website: <https://skyvexsoftware.com>
- Plugin SDK docs: <https://docs.skyvexsoftware.com/docs/plugins>

---

## License

[MIT](LICENSE) — see the LICENSE file for the full text.
