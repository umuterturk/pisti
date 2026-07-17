# Pişti

A Turkish card game with solo (vs AI) and **multiplayer** (play with a friend via share link).

## Multiplayer setup

Firebase project: **pisti-rush** (credentials in `.env.local`).

### One-time Firebase Console steps

1. **Authentication → Sign-in method** — enable **Anonymous**
2. **Authentication → Settings → Authorized domains** — ensure `localhost` and your hosting domain are listed

### Deploy Firestore rules + indexes

```bash
npm install -g firebase-tools   # if needed
firebase login
cd pisti
firebase deploy --only firestore
```

Files:
- `firestore.rules` — security rules
- `firestore.indexes.json` — composite index for `inviteCode` + `status` join queries
- `firebase.json` — Firebase CLI config (also includes hosting → `dist`)

Collections:
- `pisti-matches` — live game rooms (move log, seats, heartbeats)
- `pisti-users` — player profiles + friend sub-collection

## Development

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
