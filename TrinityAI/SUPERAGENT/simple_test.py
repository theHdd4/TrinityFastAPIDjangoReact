#!/usr/bin/env python3
"""
Simple test for text cleaning
"""

import sys
from pathlib import Path

# Add current directory to path
current_dir = Path(__file__).resolve().parent
sys.path.append(str(current_dir))

from text_cleaner import clean_ai_response

def main():
    # Test the problematic response from the image
    problematic_response = """<think> </think> Price elasticity of demand measures the responsiveness of the quantity demanded of a good or service to a change in its price. It is calculated as the percentage change in quantity demanded divided by the percentage change in price. The formula for price elasticity of demand (PED) is: PED = }

### Key Points: 1. **Elastic Demand**: If PED > 1, demand is elastic. This means that a small change in price leads to a large change in quantity demanded. Goods with many substitutes or luxury items often have elastic demand ?"""
    
    print("🧪 Testing Text Cleaning")
    print("=" * 60)
    print(f"Original Response:")
    print(problematic_response)
    print("\n" + "-" * 60)
    
    cleaned = clean_ai_response(problematic_response)
    print(f"Cleaned Response:")
    print(cleaned)
    print("\n" + "=" * 60)
    
    # Check if specific issues are fixed
    issues_fixed = []
    if "<think>" not in cleaned:
        issues_fixed.append("✅ Think tags removed")
    else:
        issues_fixed.append("❌ Think tags still present")
    
    if "###" not in cleaned:
        issues_fixed.append("✅ Markdown headers removed")
    else:
        issues_fixed.append("❌ Markdown headers still present")
    
    if "<strong>" in cleaned:
        issues_fixed.append("✅ Bold formatting converted to HTML")
    else:
        issues_fixed.append("❌ Bold formatting not converted")
    
    print("Issues Fixed:")
    for issue in issues_fixed:
        print(f"  {issue}")

if __name__ == "__main__":
    main()
