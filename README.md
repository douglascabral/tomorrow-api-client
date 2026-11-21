# Tomorrow API Client

Tomorrow is an offline-first HTTP API client. Workspace data stays on this device and is encrypted with a password you choose.

## Development

Requirements: Go 1.27, Node.js with npm, and the native WebView/build dependencies required by Wails for your operating system.

Run `make` or `make help` to list all available commands. The main workflow is:

```sh
make install
make dev
make storybook
make build
make run
```

`make storybook` starts the component documentation at `http://localhost:6006`; `make build-storybook` creates the static documentation site under `src/frontend/storybook-static`. Storybook telemetry is disabled in both commands.

`make build` builds the frontend and compiles the desktop app to `build/tomorrow` using Go; the Wails CLI is not required. Set `GO`, `NPM`, `LIZARD`, `GITLEAKS`, or `TRIVY` when a tool is not available under its default command name.

Release artifacts can be built with `make build-windows`, `make build-macos`, and `make package-linux-deb`. Windows creates `build/windows/Tomorrow.exe`; macOS creates Intel and Apple Silicon executables under `build/macos`; Linux creates only `build/tomorrow_0.1.0_amd64.deb`. The Windows and macOS executables embed the app icon. Linux packaging includes the application icon theme assets and desktop entry. `make release` builds all three platform outputs; cross-building macOS may require the Wails Pure Go cross-build tooling for the host environment.

`make security` stages only non-ignored source files for Gitleaks and Trivy. It excludes `.env` files, generated build output, and test artifacts from scans.

### Tool paths and writable Go cache

If Go or npm is not found, initialize the version managers in the current shell before running Make:

```sh
export PATH="$(go env GOROOT)/bin:$PATH"
source "$HOME/.nvm/nvm.sh"
nvm use
```

If Go reports that its cache is read-only, point it at a writable directory for that command or shell:

```sh
mkdir -p /tmp/tomorrow-go-cache
GOCACHE=/tmp/tomorrow-go-cache make build
```

The application build itself also needs the native WebView libraries required by Wails on the host operating system.

The interface follows the system language when it is Portuguese and uses Brazilian Portuguese; other system languages use English. To add a language, add its message catalog under `src/frontend/src/locales` and register its locale in `src/frontend/src/i18n.ts`. Keep message keys in English so missing translations continue to use the English source text.

Create a workspace by choosing a parent folder and a workspace name. The encrypted `workspace.enc` file is created in a new folder below that parent. To reopen a workspace, choose its root folder and enter the same password. Losing the password makes the workspace unrecoverable.

After unlocking, create collections, folders, and requests in the sidebar. Adding a request expands its collection and focuses the new request. Use an item's **⋯** menu to rename, add, duplicate, move, reorder, run, or delete it. Select the active environment in the request toolbar; new environments are stored with the encrypted workspace. Params and Headers use editable key-value tables, while Auth supports Bearer and Basic credentials. Environment variables are suggested in request URLs, parameter/header values, and the JSON body. Multipart text fields accept JSON in the body editor; named file fields use the table below, with multiple removable files per field. Request edits stay as drafts until **Save**; moving away opens an in-app choice to save, discard, or stay. **Send** saves the current request and sends it only after the button is pressed, with progress feedback while saving or sending. Generated cURL, PHP, Node.js, Python, Go, and Java snippets open in a modal and include configured parameters, headers, authentication, body data, and attached files. GNU Wget cannot send multipart requests, so its snippet explains the limitation and provides the equivalent cURL command. The response body and request body can be formatted as JSON; sent headers include the HTTP request line, and the Timeline shows URL, method, status, and duration. Responses stay in memory; request history is encrypted with workspace data. HTML preview uses the response URL as its base and runs scripts in a sandboxed frame so relative assets can load without exposing the app origin.

Request scripts use `request`, `response`, and `environment` objects. Pre-request scripts can update the outgoing request. Post-response scripts can save string values such as tokens with `environment.accessToken = String(data.access_token)`; Tomorrow saves those values in the active encrypted environment for later requests. Test scripts run after post-response scripts and report failures when an assertion throws an error.

On Linux, `make build` creates the application desktop entry and hicolor icon assets under `build/share`. `make run` exposes that directory to GTK so the title bar can resolve the Tomorrow icon when using the GTK4 backend.

Environment variables can be marked exportable. Unchecked values are omitted from Postman exports. The app asks for confirmation before deleting environments and removing editor rows.

New and clicked collections are selected in the sidebar without closing the open request. Collections and folders can be expanded or collapsed. Drag a request or folder by its handle onto a collection or folder to move it, or to the top or bottom edge of an item to reorder it.

Drag the response divider or use the keyboard on the resize control to change the response panel height; use its toggle to minimize or restore it.

Open **Settings** from the sidebar to choose English or Brazilian Portuguese, select the System, Light, Dark, or High contrast appearance, and set request timeouts from 10 to 120 seconds. Preferences are stored on this device. System appearance follows the operating system's light or dark setting and updates while the app is open. Requests use the system proxy settings. Workspaces are locked when the app closes; change the workspace password in Settings to re-encrypt its data.

HTTP requests identify the client with `User-Agent: Tomorrow/0.1.0`. A request-level `User-Agent` header can override the default.

In **History**, confirm before removing a single request or clearing every entry. History changes are saved in the encrypted workspace.
