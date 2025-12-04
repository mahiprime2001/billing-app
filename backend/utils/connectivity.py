"""
Connectivity Manager for Supabase-first architecture
Checks internet connectivity and provides decorator for fallback logic
"""
import requests
import logging
from functools import wraps
import time

logger = logging.getLogger(__name__)

class ConnectivityManager:
    def __init__(self):
        self._is_online = True
        self._last_check = 0
        self._check_interval = 5  # Check every 5 seconds
        self._consecutive_failures = 0
        self._max_failures = 3  # After 3 failures, consider offline
    
    def is_online(self) -> bool:
        """Check if internet connection is available with caching"""
        current_time = time.time()
        
        # Cache the result for _check_interval seconds
        if current_time - self._last_check < self._check_interval:
            return self._is_online
        
        self._last_check = current_time
        
        try:
            # Quick check to DNS resolver
            response = requests.get(
                "https://1.1.1.1/cdn-cgi/trace",
                timeout=2
            )
            
            if response.status_code == 200:
                self._is_online = True
                self._consecutive_failures = 0
                return True
            else:
                self._consecutive_failures += 1
        except (requests.ConnectionError, requests.Timeout):
            self._consecutive_failures += 1
        except Exception as e:
            logger.warning(f"Connectivity check error: {e}")
            self._consecutive_failures += 1
        
        # Only mark as offline after multiple consecutive failures
        if self._consecutive_failures >= self._max_failures:
            self._is_online = False
        
        return self._is_online
    
    def force_offline(self):
        """Manually set offline mode (for testing)"""
        self._is_online = False
        logger.warning("Forced OFFLINE mode")
    
    def force_online(self):
        """Manually set online mode (for testing)"""
        self._is_online = True
        self._consecutive_failures = 0
        logger.info("Forced ONLINE mode")
    
    def reset(self):
        """Reset connectivity state"""
        self._is_online = True
        self._consecutive_failures = 0
        self._last_check = 0

# Global instance
connectivity = ConnectivityManager()
