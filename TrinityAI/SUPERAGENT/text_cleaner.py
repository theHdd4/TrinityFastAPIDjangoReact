#!/usr/bin/env python3
"""
Text cleaning module for AI responses
Handles LaTeX, markdown, and other formatting issues
"""

import re
import html

class TextCleaner:
    """Comprehensive text cleaner for AI responses."""
    
    def __init__(self):
        # Patterns for various text cleaning operations
        self.think_patterns = [
            r'<think>.*?</think>',  # Remove think tags
            r'<think\s*>.*?</think>',  # Remove think tags with whitespace
            r'<thinking>.*?</thinking>',  # Remove thinking tags
        ]
        
        self.latex_patterns = [
            # LaTeX text formatting (handle first to preserve content)
            (r'\\text\{([^}]*)\}', r'\1'),
            (r'\\textbf\{([^}]*)\}', r'\1'),
            (r'\\textit\{([^}]*)\}', r'\1'),
            (r'\\emph\{([^}]*)\}', r'\1'),
            
            # Specific LaTeX symbols to convert (before removing commands)
            (r'\\approx', '≈'),
            (r'\\times', '×'),
            (r'\\div', '÷'),
            (r'\\pm', '±'),
            (r'\\leq', '≤'),
            (r'\\geq', '≥'),
            (r'\\neq', '≠'),
            (r'\\infty', '∞'),
            (r'\\sum', 'Σ'),
            (r'\\prod', 'Π'),
            (r'\\int', '∫'),
            
            # Greek letters
            (r'\\alpha', 'α'),
            (r'\\beta', 'β'),
            (r'\\gamma', 'γ'),
            (r'\\delta', 'δ'),
            (r'\\epsilon', 'ε'),
            (r'\\theta', 'θ'),
            (r'\\lambda', 'λ'),
            (r'\\mu', 'μ'),
            (r'\\pi', 'π'),
            (r'\\sigma', 'σ'),
            (r'\\tau', 'τ'),
            (r'\\phi', 'φ'),
            (r'\\omega', 'ω'),
            
            # LaTeX delimiters and math environments
            (r'\\([()\[\]])', r'\1'),  # Convert \( \) to ( )
            (r'\\\[', '['),
            (r'\\\]', ']'),
            (r'\\{', ''),
            (r'\\}', ''),
            
            # Complex LaTeX commands (after preserving content)
            (r'\\[a-zA-Z]+\{[^}]*\}', ''),  # Remove remaining LaTeX commands with braces
            (r'\\[a-zA-Z]+', ''),  # Remove simple LaTeX commands
        ]
        
        self.markdown_patterns = [
            # Headers
            (r'^#{1,6}\s*', ''),  # Remove markdown headers
            (r'#{1,6}\s*', ''),   # Remove markdown headers anywhere
            
            # Bold and italic (keep as plain text - NO HTML)
            (r'\*\*([^*]+)\*\*', r'\1'),  # Remove ** markdown bold
            (r'\*([^*]+)\*', r'\1'),       # Remove * markdown italic
            (r'__([^_]+)__', r'\1'),       # Remove __ markdown bold
            (r'_([^_]+)_', r'\1'),         # Remove _ markdown italic
            
            # Lists
            (r'^\s*[-*+]\s*', '• '),  # Convert bullet lists
            (r'^\s*\d+\.\s*', ''),    # Remove numbered lists
            
            # Links
            (r'\[([^\]]+)\]\([^)]+\)', r'\1'),  # Remove markdown links
        ]
        
        # HTML tag patterns (remove any HTML tags)
        self.html_patterns = [
            (r'<strong>(.*?)</strong>', r'\1'),  # Remove strong tags
            (r'<b>(.*?)</b>', r'\1'),            # Remove bold tags
            (r'<em>(.*?)</em>', r'\1'),          # Remove em tags
            (r'<i>(.*?)</i>', r'\1'),            # Remove italic tags
            (r'<u>(.*?)</u>', r'\1'),            # Remove underline tags
            (r'<span[^>]*>(.*?)</span>', r'\1'), # Remove span tags
            (r'<div[^>]*>(.*?)</div>', r'\1'),   # Remove div tags
            (r'<p>(.*?)</p>', r'\1'),            # Remove p tags
            (r'<[^>]+>', ''),                    # Remove any remaining HTML tags
        ]
        
        self.cleanup_patterns = [
            # Remove remaining artifacts
            (r'\{[^}]*\}', ''),  # Remove remaining braces
            (r'\\[a-zA-Z]', ''),  # Remove remaining backslashes
            (r'\\[^a-zA-Z]', ''),  # Remove remaining backslashes with non-letters
            (r'\\\\', ''),  # Remove double backslashes
            
            # Clean up formatting
            (r'\s+', ' '),  # Replace multiple spaces with single space
            (r'\n\s*\n', '\n\n'),  # Clean up multiple newlines
        ]
    
    def clean_text(self, text: str) -> str:
        """Main text cleaning function."""
        if not text:
            return ""
        
        # Step 1: Remove think tags
        text = self._remove_think_tags(text)
        
        # Step 2: Remove HTML tags
        text = self._clean_html(text)
        
        # Step 3: Handle LaTeX
        text = self._clean_latex(text)
        
        # Step 4: Handle markdown
        text = self._clean_markdown(text)
        
        # Step 5: Final cleanup
        text = self._final_cleanup(text)
        
        return text.strip()
    
    def _remove_think_tags(self, text: str) -> str:
        """Remove think tags from text."""
        for pattern in self.think_patterns:
            text = re.sub(pattern, '', text, flags=re.DOTALL | re.IGNORECASE)
        return text
    
    def _clean_html(self, text: str) -> str:
        """Remove HTML tags from text."""
        for pattern, replacement in self.html_patterns:
            text = re.sub(pattern, replacement, text, flags=re.DOTALL | re.IGNORECASE)
        return text
    
    def _clean_latex(self, text: str) -> str:
        """Clean LaTeX formatting."""
        for pattern, replacement in self.latex_patterns:
            text = re.sub(pattern, replacement, text)
        return text
    
    def _clean_markdown(self, text: str) -> str:
        """Clean and convert markdown formatting."""
        lines = text.split('\n')
        cleaned_lines = []
        
        for line in lines:
            # Apply markdown patterns
            for pattern, replacement in self.markdown_patterns:
                line = re.sub(pattern, replacement, line)
            
            # Clean up the line
            line = line.strip()
            if line:
                cleaned_lines.append(line)
        
        return '\n'.join(cleaned_lines)
    
    def _final_cleanup(self, text: str) -> str:
        """Final cleanup operations."""
        for pattern, replacement in self.cleanup_patterns:
            text = re.sub(pattern, replacement, text)
        
        # Remove any remaining backslashes
        text = text.replace('\\', '')
        
        # Clean up extra whitespace
        text = re.sub(r'\s+', ' ', text)
        
        return text.strip()
    
    def format_for_display(self, text: str) -> dict:
        """Format text for display as plain text (no HTML)."""
        cleaned_text = self.clean_text(text)
        
        # Split into paragraphs
        paragraphs = [p.strip() for p in cleaned_text.split('\n\n') if p.strip()]
        
        return {
            'text': cleaned_text,
            'paragraphs': paragraphs,
            'has_formatting': False  # We always strip HTML now
        }

# Global instance
text_cleaner = TextCleaner()

def clean_ai_response(response: str) -> str:
    """Clean AI response text."""
    return text_cleaner.clean_text(response)

def format_ai_response(response: str) -> dict:
    """Format AI response for display."""
    return text_cleaner.format_for_display(response)
