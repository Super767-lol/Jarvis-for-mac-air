"""
Idle Manager for JARVIS
Handles idle timeout and transitions to trailer/screensaver mode after 15 minutes
"""
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, Callable
import logging

logger = logging.getLogger(__name__)

class IdleManager:
    """Manages user activity tracking and idle timeout behavior"""
    
    def __init__(self, idle_timeout_seconds: int = 900):  # 15 minutes default
        self.idle_timeout = idle_timeout_seconds
        self.last_activity: Optional[datetime] = None
        self.idle_callback: Optional[Callable] = None
        self.is_idle = False
        self._task: Optional[asyncio.Task] = None
    
    def register_activity(self):
        """Call this whenever user interacts with JARVIS"""
        self.last_activity = datetime.now(timezone.utc)
        
        if self.is_idle:
            logger.info("User returned from idle")
            self.is_idle = False
    
    def set_idle_callback(self, callback: Callable):
        """Set callback function to trigger when idle timeout reached"""
        self.idle_callback = callback
    
    async def check_idle_loop(self):
        """Background task that checks for idle timeout"""
        while True:
            await asyncio.sleep(30)  # Check every 30 seconds
            
            if not self.last_activity:
                continue
            
            time_since_activity = (datetime.now(timezone.utc) - self.last_activity).total_seconds()
            
            if time_since_activity >= self.idle_timeout and not self.is_idle:
                logger.info(f"Idle timeout reached ({self.idle_timeout}s)")
                self.is_idle = True
                
                if self.idle_callback:
                    try:
                        await self.idle_callback()
                    except Exception as e:
                        logger.error(f"Idle callback error: {e}")
    
    def start(self):
        """Start the idle checker background task"""
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self.check_idle_loop())
            self.last_activity = datetime.now(timezone.utc)
            logger.info(f"Idle manager started (timeout: {self.idle_timeout}s)")
    
    def stop(self):
        """Stop the idle checker"""
        if self._task and not self._task.done():
            self._task.cancel()
            logger.info("Idle manager stopped")


class TrailerMode:
    """Manages Iron Man trailer/screensaver mode"""
    
    TRAILER_SEQUENCES = [
        {
            "phase": "helmet_assembly",
            "duration": 8,
            "visuals": "Helmet pieces assembling from darkness, HUD booting up",
            "audio": "Mechanical servo sounds, arc reactor hum rising"
        },
        {
            "phase": "hud_activation", 
            "duration": 5,
            "visuals": "Targeting reticles, system diagnostics scrolling",
            "audio": "JARVIS voice: 'Systems online, sir'"
        },
        {
            "phase": "power_surge",
            "duration": 4,
            "visuals": "Arc reactor glow intensifying, energy ripples",
            "audio": "Power surge, repulsor charge-up"
        },
        {
            "phase": "ready_state",
            "duration": 3,
            "visuals": "Helmet locks into place, eyes glow blue",
            "audio": "Helmet seal hiss, full power hum"
        }
    ]
    
    @classmethod
    def get_trailer_config(cls) -> dict:
        """Returns full trailer configuration for frontend"""
        return {
            "enabled": True,
            "idle_trigger_seconds": 900,
            "sequences": cls.TRAILER_SEQUENCES,
            "loop": True,
            "total_duration": sum(s["duration"] for s in cls.TRAILER_SEQUENCES),
            "asset_path": "/assets/ironman_helmet_4k.mp4",  # Will need 4K video file
            "audio_path": "/assets/trailer_audio.mp3"
        }
