# Privacy policy

Işıl is a photo editor that processes your photos only on your own computer. This policy applies to the Windows app distributed through GitHub and the Microsoft Store.

**Last updated:** 22 October 2026 · Contact: open an issue at https://github.com/tolguner/isil/issues

## What Işıl does not do

- Işıl does not upload your photos anywhere. Editing, face detection, retouching and all AI tools run locally on your device.
- There is no account, sign-in, cloud storage, advertising, analytics or tracking. Usage statistics attempts by bundled libraries are blocked inside the app.
- The developer does not receive, collect or store any personal information.

## Face data

Face landmarks are computed in memory only while you edit. They are not stored, not used to identify anyone and never transmitted.

## When the app connects to the internet

Only for downloads you start yourself:

- AI model files from Hugging Face (huggingface.co),
- the optional local AI engine: Python from python.org, packages from PyPI (pypi.org, files.pythonhosted.org) and PyTorch from download.pytorch.org.

These requests contain no photos and no personal information. Every file is pinned to a fixed version and verified with SHA-256 before use.

## Data stored on your device

Projects, settings and an error log are kept in `%APPDATA%\Işıl` on your computer. The error log contains error messages only, no photos or personal data, and leaves your device only if you choose to share it.

## Exported files

When you export, location (GPS) data is always removed. Capture date and camera details are kept by default and can be removed in Settings. If generative AI was used, a machine-readable "edited with AI" record (IPTC DigitalSourceType) is written into the file.

## Reporting inappropriate AI results

The "Report" link after a generative AI result opens a pre-filled form on GitHub in your browser. Nothing is sent unless you submit that form yourself, and no image is attached unless you add one.

## Children

Işıl is not directed at children. Body and outfit editing tools are turned off for photos in which a person appears to be under 18.

## Changes

Changes to this policy are published in this file in the project's public repository.
