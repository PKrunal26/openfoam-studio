# Support, backup, and recovery

Report ordinary failures through [GitHub issues](https://github.com/PKrunal26/openfoam-studio/issues). Include app version, operating system/architecture, provider/model name (no key), Docker/OpenFOAM image version, the action attempted, and a minimal redacted log. Do not include prompts or case data you are not allowed to share. Security reports should follow [SECURITY.md](../SECURITY.md).

Before upgrades, stop active operations, quit the app, and back up the whole user-data directory. Default packaged locations are `~/Library/Application Support/OpenFOAM Studio` on macOS and `%APPDATA%/OpenFOAM Studio` on Windows. Config and projects live there; explicit `OFS_CONFIG_DIR` overrides change the location. Source/demo projects can live under `demo/projects`. Keep backups outside the installation directory. Windows uninstall now preserves application data; deletion should be an intentional user action after backup.

An OS-encrypted credential file is tied to the machine/account keychain and may not decrypt on another machine. Transfer projects/results separately and enter keys again on the destination. Use Export in a project to download its JSON case/run bundle and Import project on the home screen to reopen it as a new project. The export supports up to 128 MiB of decoded project data and 192 MiB of encoded JSON; copy larger project folders separately. Exports preserve case inputs, run metadata/logs, and saved result archives. Retain the immutable run/revision identity. A screenshot alone is not a reproducible simulation.

The project toolbar can download a Support bundle with project/chat/command details and known credentials redacted. Review the file before sharing: automatic redaction cannot identify every sensitive value. This action only downloads a local file and never sends it to support.

Deleting a project moves its folder to `projects/.trash` under the user-data directory. The app has no restore button yet. For manual recovery, quit the app, back up the trash folder, and restore its project directory using the original project ID from `meta.json`; avoid replacing an existing project.

If startup reports port 3456 occupied, close the existing app/server and relaunch. The packaged app requires its own authenticated backend. If Docker does not respond, start Docker Desktop, retry the checklist, and cancel a stuck repair before retrying. If a save fails, preserve the editor contents separately and check free disk space before trying again.

For rollback, back up user data first and install the previously reviewed versioned artifact. Compatibility of newer project metadata with older app releases is not guaranteed; restore a separate matching backup if needed. No automated updater or downgrade migration guarantee is claimed.
