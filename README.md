# Community Christmas Tree

A shared 3D Christmas tree. Participants upload a `.glb` ornament with a name and an optional message. The app checks it, positions its top centre at the hanging point, and places it on one of 60 branch slots. The upload section includes a copyable prompt for a Claude agent connected to Rhino MCP.

It is a plain Next.js app that runs on a single machine. Metadata lives in SQLite, uploaded files live on local disk, and nothing else is needed: no cloud services, no accounts, no database server. The HTTP API and the `.glb` preview format are specified in [`API_CONTRACT.md`](API_CONTRACT.md).

## Prerequisites

- Node.js **22.13 or newer** (for the built-in `node:sqlite` module). Check with `node --version`.
- npm (bundled with Node).

## Install, build, run

```sh
npm install
npm run build
npm start
```

The server listens on `0.0.0.0:3000`, so colleagues on the same network can open `http://<your-machine>.local:3000` (or your LAN IP). On first request it creates the data directory and applies the database migrations in `drizzle/`. Applied migrations are recorded in a `__migrations` table, so restarts don't re-run them.

For development with hot reload, use `npm run dev`. Other scripts: `npm test`, `npm run lint`, and `npm run db:generate` (regenerate SQL in `drizzle/` after changing `db/schema.ts`).

## Ornament uploads

New uploads are GLB 2.0 only: up to 512 KiB, 8,000 triangles, four solid-color PBR materials, and 4 inches (101.6 mm) on each side. No textures, animation, or external resources. Files use metres and Y-up; the app preserves physical size and hangs them from the top centre. Unsupported extensions are rejected. Existing Rhino sources and their previews remain available.

Participants can copy the prompt beside the upload form into Claude with Rhino MCP connected. The prompt asks the agent to export the selected ornament, check the limits, and report the file path. The app shows a preview before sharing and validates the model again on the server.

## Configuration

| Variable   | Default   | Meaning |
|------------|-----------|---------|
| `PORT`     | `3000`    | Port to listen on. |
| `HOSTNAME` | `0.0.0.0` | Interface to bind. Use `127.0.0.1` to keep the tree private to this machine. |
| `DATA_DIR` | `./data`  | Where the database and uploaded files are kept. Relative paths resolve from the directory you start the server in. |

```sh
PORT=8080 DATA_DIR=/srv/tree-data npm start
```

## Where data lives

```
$DATA_DIR/
  tree.db, tree.db-wal, tree.db-shm   SQLite database (WAL mode)
  models/ornaments/<id>.source.glb    original GLB uploads
  models/ornaments/<id>.glb           GLBs positioned for hanging on the tree
```

`data/` is git-ignored. Everything else in the checkout can be rebuilt from source.

### Backups

Take a consistent copy of the database with SQLite's online backup (safe while the server runs), then copy the model files:

```sh
mkdir -p backups/$(date +%F)
sqlite3 data/tree.db ".backup backups/$(date +%F)/tree.db"
rsync -a data/models/ backups/$(date +%F)/models/
```

Copying the files only while the server is stopped is also fine. To restore, stop the server, put `tree.db` and `models/` back into `$DATA_DIR`, delete any stale `tree.db-wal`/`tree.db-shm`, and start it again.

## Keeping it running

### pm2

```sh
npm install -g pm2
pm2 start npm --name christmas-tree -- start && pm2 save
```

Run `pm2 startup` once to have pm2 itself start at boot.

### launchd (macOS)

Save as `~/Library/LaunchAgents/com.example.christmas-tree.plist`, replacing the paths with your checkout and your Node install (`which node`, `which npm`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.example.christmas-tree</string>
  <key>WorkingDirectory</key><string>/Users/you/christmas-tree</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/npm</string>
    <string>start</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>PORT</key><string>3000</string>
    <key>DATA_DIR</key><string>/Users/you/christmas-tree/data</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/Users/you/christmas-tree/data/server.log</string>
  <key>StandardErrorPath</key><string>/Users/you/christmas-tree/data/server.log</string>
</dict>
</plist>
```

```sh
mkdir -p /Users/you/christmas-tree/data   # launchd needs the log directory to exist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.example.christmas-tree.plist
launchctl kickstart -k gui/$(id -u)/com.example.christmas-tree   # restart after a rebuild
launchctl bootout gui/$(id -u)/com.example.christmas-tree        # stop and unload
```

Run `npm run build` before restarting the service whenever you pull new code. To keep the Mac from sleeping while it serves the tree, enable "Prevent automatic sleeping when the display is off" in System Settings → Battery/Energy, or run `caffeinate -s`.

## Project layout

- `app/`: Next.js pages and the `/api/ornaments` route handlers
- `lib/ornaments/`: upload validation, the ornament service, SQLite repository and file store
- `lib/tree/`, `components/`: the three.js tree scene and UI
- `db/`: schema (`schema.ts`) and the SQLite connection and migration runner (`index.ts`)
- `drizzle/`: SQL migrations generated by drizzle-kit
- `lib/ornaments/prepare-glb.ts`: validates direct GLBs and centres their hanging origin
- `components/glb-agent-prompt.tsx`: copyable Rhino MCP preparation prompt
- `lib/convert/`: legacy Rhino conversion utilities and fixture tooling
- `scripts/start.mjs`: `next start` with the `PORT`/`HOSTNAME` defaults above
