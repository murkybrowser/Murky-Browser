# Murky

A desktop web browser built on Electron.

## Run from source

    npm install
    npm start

## Build

    npm run dist:win

Releases are published on GitHub as tags like `2.0.0-Windows`. The browser's updater and the web installer both read them.

## Importing from other browsers

`src/browser-migration.js` powers the "import from another browser" feature. At the user's request it copies bookmarks, history, search engines and cookies from another browser installed on the same machine. Cookies are decrypted locally with the operating system's own mechanism (Windows DPAPI, macOS Keychain) so they can be loaded into Murky. Saved passwords are not imported, and the module makes no network requests.

## License

Code: MIT, see `LICENSE`. Third-party work: see `THIRD_PARTY_NOTICES.md`.

The Murky name and logos (`assets/`, `build/`) are not covered by the MIT license. Please don't use them to represent a modified version of the browser as the official Murky.
