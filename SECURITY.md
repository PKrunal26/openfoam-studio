# Security policy

Report vulnerabilities privately using the repository's Security > Report a vulnerability control if available. Do not include working secrets, private CFD cases, or exploit payloads in public issues. Include the affected version/commit, impact, and minimal reproduction. No response-time SLA is currently promised. Security fixes target the current candidate; older rolling releases are not maintained as separate branches.

The app serves a loopback HTTP API with Host/Origin checks and privileged-request authentication. Electron verifies application/version/protocol before using a backend, restricts navigation, disables Node in the renderer, and delegates credential encryption to OS-backed safeStorage. Headless/source storage has different guarantees; see [privacy guidance](docs/PRIVACY.md).

OpenFOAM dictionaries and third-party CLI tooling are execution inputs. Command allowlists and case policy are defense layers, not a blanket sandbox guarantee. Reports involving path traversal, unexpected executable dictionaries, unauthorized host/container operations, token/key leakage, cross-origin access, incorrect project mutation, or packaging of local user projects are in scope. Do not run untrusted cases on systems containing sensitive data.

Code-signing/notarization, clean-platform testing, provider-side retention, Docker/OpenFOAM vulnerabilities, and local-machine compromise require separate controls. Missing signing is a known alpha limitation and remains a broad-release gate; see the README.
