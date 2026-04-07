# Lineage App Setup

## Quick Start (All Platforms)

```bash
cd lineage-app
npm run install-all
npm start
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8080

## Windows Setup

### Option 1: Use Prebuilt Binaries (Recommended)
Most Windows x64 users can run `npm run install-all` directly - prebuilt binaries are downloaded automatically.

### Option 2: If Installation Fails
If you see native compilation errors, install build tools:

**Using npm (requires admin PowerShell):**
```powershell
npm install --global windows-build-tools
```

**Or install manually:**
1. Download [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
2. Select "Desktop development with C++" workload
3. Restart terminal and run `npm run install-all` again

## Troubleshooting

### Port Already in Use
Run `npm run clean` to kill processes on ports 3000 and 8080.

### Database Reset
Delete `backend/lineage.db` to reset the database.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start both backend and frontend |
| `npm run clean` | Kill processes on ports 3000/8080 |
| `npm run install-all` | Install all dependencies |
| `npm run build` | Build for production |
