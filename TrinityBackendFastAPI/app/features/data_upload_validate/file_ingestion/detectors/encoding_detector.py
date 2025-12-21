"""Encoding detection for text files."""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Try to import chardet for encoding detection
try:
    import chardet
    CHARDET_AVAILABLE = True
except ImportError:
    CHARDET_AVAILABLE = False
    logger.warning("chardet not available, using fallback encoding detection")


class EncodingDetector:
    """Detect text file encoding."""

    @staticmethod
    def detect(content: bytes, sample_size: int = 20000) -> str:
        """
        Detect encoding from content bytes.
        
        Args:
            content: File content bytes
            sample_size: Number of bytes to sample for detection
            
        Returns:
            str: Detected encoding (defaults to 'utf-8' if detection fails)
        """
        if not CHARDET_AVAILABLE:
            return EncodingDetector._fallback_detection(content[:sample_size])
        
        try:
            sample = content[:sample_size]
            result = chardet.detect(sample)
            encoding = result.get('encoding', 'utf-8')
            confidence = result.get('confidence', 0)
            
            # If confidence is too low, try fallback
            if confidence < 0.5:
                logger.debug(f"Low confidence ({confidence}) for encoding {encoding}, trying fallback")
                return EncodingDetector._fallback_detection(sample)
            
            # Normalize common encodings
            encoding = encoding.lower()
            if encoding in ['iso-8859-1', 'latin1']:
                return 'latin-1'
            if encoding in ['windows-1252', 'cp1252']:
                return 'cp1252'
            
            return encoding or 'utf-8'
        except Exception as e:
            logger.warning(f"Encoding detection failed: {e}, using fallback")
            return EncodingDetector._fallback_detection(content[:sample_size])

    @staticmethod
    def _fallback_detection(sample: bytes) -> str:
        """Fallback encoding detection using simple heuristics."""
        # Try UTF-8 first
        try:
            sample.decode('utf-8')
            return 'utf-8'
        except UnicodeDecodeError:
            pass
        
        # Try common encodings
        for encoding in ['latin-1', 'cp1252', 'iso-8859-1']:
            try:
                sample.decode(encoding)
                return encoding
            except UnicodeDecodeError:
                continue
        
        # Last resort: use utf-8 with errors='ignore'
        return 'utf-8'

