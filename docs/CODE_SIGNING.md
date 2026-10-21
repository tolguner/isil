# Code signing policy

Windows installers of Işıl are built from this repository by GitHub Actions ([release workflow](../.github/workflows/release.yml)) and published on the [Releases](https://github.com/tolguner/isil/releases) page.

Free code signing is provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org) (application in progress; until it is approved, release builds are unsigned).

## Team roles

| Role | Member |
|---|---|
| Committer and reviewer | [@tolguner](https://github.com/tolguner) |
| Approver | [@tolguner](https://github.com/tolguner) |

Only release builds made by the GitHub Actions workflow from a tagged commit on `main` are submitted for signing. Every signing request is approved manually.

## What is signed

- `Isil-Setup-<version>.exe` (NSIS installer) and the application executable inside it.

Işıl downloads optional components after installation (AI models from Hugging Face, Python and its packages from python.org, PyPI and download.pytorch.org). These are third-party files: they are not signed by this project, but every download is pinned to a fixed version and verified with SHA-256 before use (see [`src/shared/manifest.json`](../src/shared/manifest.json) and [`engine/requirements.lock`](../engine/requirements.lock)).

## Privacy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it. Photos are processed only on the user's computer. The only network requests are the optional downloads listed above, started by the user. See the [privacy notice](GIZLILIK.md).
