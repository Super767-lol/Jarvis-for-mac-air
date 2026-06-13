"""
Offline Mode Module for JARVIS
Provides local response caching and fallback when network is unavailable
"""
import json
import hashlib
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, Dict, Any
import aiofiles

CACHE_DIR = Path(__file__).parent / ".cache" / "offline"
CACHE_DIR.mkdir(parents=True, exist_ok=True)


class OfflineCache:
    """Manages offline response caching and retrieval"""
    
    def __init__(self, cache_dir: Path = CACHE_DIR):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
    
    def _hash_query(self, query: str) -> str:
        """Generate cache key from query"""
        return hashlib.sha256(query.lower().strip().encode()).hexdigest()[:16]
    
    async def get(self, query: str) -> Optional[Dict[str, Any]]:
        """Retrieve cached response for query"""
        cache_key = self._hash_query(query)
        cache_file = self.cache_dir / f"{cache_key}.json"
        
        if not cache_file.exists():
            return None
        
        try:
            async with aiofiles.open(cache_file, 'r') as f:
                data = json.loads(await f.read())
                return data
        except Exception:
            return None
    
    async def set(self, query: str, response: str, metadata: Dict[str, Any] = None):
        """Cache response for query"""
        cache_key = self._hash_query(query)
        cache_file = self.cache_dir / f"{cache_key}.json"
        
        data = {
            "query": query,
            "response": response,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "metadata": metadata or {}
        }
        
        try:
            async with aiofiles.open(cache_file, 'w') as f:
                await f.write(json.dumps(data, indent=2))
        except Exception as e:
            print(f"Cache write error: {e}")


class OfflineFallback:
    """Provides intelligent fallback responses when offline"""
    
    COMMON_RESPONSES = {
        "greeting": "I'm currently in offline mode, but I'm still here to help with what I can access locally.",
        "file_operation": "I can still access your local files. What would you like me to do?",
        "system_command": "System commands work offline. I'm ready to execute.",
        "web_search": "I'm offline right now and can't search the web, but I can help with local tasks.",
        "default": "I'm running in offline mode with limited connectivity. I can still help with local file operations, system commands, and cached information."
    }
    
    def __init__(self, cache: OfflineCache):
        self.cache = cache
    
    def classify_query(self, query: str) -> str:
        """Classify query type for appropriate fallback"""
        q_lower = query.lower()
        
        if any(word in q_lower for word in ["hi", "hello", "hey", "sup"]):
            return "greeting"
        elif any(word in q_lower for word in ["file", "open", "read", "write", "save"]):
            return "file_operation"
        elif any(word in q_lower for word in ["run", "execute", "command", "terminal"]):
            return "system_command"
        elif any(word in q_lower for word in ["search", "google", "web", "online", "internet"]):
            return "web_search"
        else:
            return "default"
    
    async def get_response(self, query: str) -> str:
        """Get fallback response for query"""
        # First check cache
        cached = await self.cache.get(query)
        if cached:
            return f"{cached['response']}\n\n_(Retrieved from offline cache)_"
        
        # Otherwise use intelligent fallback
        query_type = self.classify_query(query)
        return self.COMMON_RESPONSES.get(query_type, self.COMMON_RESPONSES["default"])


async def is_online() -> bool:
    """Check if internet connectivity is available"""
    import aiohttp
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get('https://www.google.com', timeout=aiohttp.ClientTimeout(total=2)):
                return True
    except:
        return False
