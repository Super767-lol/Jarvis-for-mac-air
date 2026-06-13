# 🔌 Offline Mode Feature

## Overview
JARVIS now supports **offline mode** with intelligent caching and fallback responses when internet connectivity is unavailable.

## Features

### Backend (`backend/offline_mode.py`)
- **Offline Cache**: Automatically caches successful responses locally
- **Smart Fallback**: Provides context-aware responses when offline
- **Query Classification**: Categorizes queries to give appropriate offline responses
- **Connectivity Check**: Automatically detects online/offline status

### Frontend (`jarvis-desktop/renderer/OfflineIndicator.jsx`)
- **Visual Indicator**: Orange badge appears when offline
- **Auto-Detection**: Checks connectivity every 30 seconds
- **Seamless UX**: No interruption to user workflow

## How It Works

1. **Online**: Normal operation with full LLM capabilities + response caching
2. **Offline**: Falls back to:
   - Cached responses from previous queries
   - Intelligent fallback messages based on query type
   - Local file operations and system commands still work

## API Changes

### New Endpoint
```
GET /api/status
```
Returns:
```json
{
  "online": true,
  "mode": "online",
  "timestamp": "2025-06-12T19:06:00Z"
}
```

### Modified Response
```
POST /api/chat/stream
```
Now includes `offline` flag in done event:
```json
{"type": "done", "offline": false}
```

## Cache Location
Responses cached in: `backend/.cache/offline/`

## Dependencies Added
- `aiofiles` - Async file operations
- `aiohttp` - Connectivity checking

Install with:
```bash
cd backend
pip install -r requirements.txt
```

## Usage
No configuration needed! JARVIS automatically:
- Detects connectivity status
- Switches to offline mode when needed
- Caches responses for future offline use
- Displays offline indicator in UI

## Example Scenarios

### Cached Query (Offline)
**User**: "What's the weather?"
**JARVIS**: _(Returns cached response from when online)_
> "It's 72°F and sunny in San Francisco"
> 
> _(Retrieved from offline cache)_

### Uncached Query (Offline)
**User**: "Open Terminal"
**JARVIS**: 
> "System commands work offline. I'm ready to execute."

**User**: "Search the web for Python tutorials"
**JARVIS**: 
> "I'm offline right now and can't search the web, but I can help with local tasks."
