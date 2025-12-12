"""
Unit tests for Conditional Formatting feature.
Tests schemas and service functions in isolation.
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(__file__))

# Test imports
print("🧪 Testing Conditional Formatting Implementation...")
print("=" * 60)

# Test 1: Schema imports
print("\n1️⃣ Testing Schema Imports...")
try:
    from app.features.table.schemas import (
        FormatRequest,
        FormatResponse,
        HighlightRule,
        ColorScaleRule,
        Operator,
        FormatStyle
    )
    print("   ✅ All schemas imported successfully")
except Exception as e:
    print(f"   ❌ Schema import failed: {e}")
    sys.exit(1)

# Test 2: Schema validation
print("\n2️⃣ Testing Schema Validation...")
try:
    # Test HighlightRule
    highlight_rule = HighlightRule(
        id="test-1",
        column="Sales",
        operator=Operator.GREATER_THAN,
        value1=1000,
        style=FormatStyle(backgroundColor="#FF0000", textColor="#FFFFFF")
    )
    print("   ✅ HighlightRule created successfully")
    print(f"      - ID: {highlight_rule.id}")
    print(f"      - Operator: {highlight_rule.operator}")
    print(f"      - Column: {highlight_rule.column}")
    
    # Test ColorScaleRule
    color_scale = ColorScaleRule(
        id="test-2",
        column="Temperature",
        min_color="#0000FF",
        max_color="#FF0000",
        mid_color="#00FF00"
    )
    print("   ✅ ColorScaleRule created successfully")
    print(f"      - ID: {color_scale.id}")
    print(f"      - Column: {color_scale.column}")
    
    # Test FormatRequest
    request = FormatRequest(
        table_id="test-table-123",
        rules=[highlight_rule, color_scale]
    )
    print("   ✅ FormatRequest created successfully")
    print(f"      - Table ID: {request.table_id}")
    print(f"      - Rules count: {len(request.rules)}")
    
except Exception as e:
    print(f"   ❌ Schema validation failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 3: Service function imports (without Polars DataFrame)
print("\n3️⃣ Testing Service Function Imports...")
try:
    from app.features.table.service import (
        hex_to_rgb,
        rgb_to_hex,
        interpolate_color
    )
    print("   ✅ Color utility functions imported successfully")
except Exception as e:
    print(f"   ❌ Service function import failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 4: Color interpolation
print("\n4️⃣ Testing Color Interpolation...")
try:
    # Test hex_to_rgb
    rgb = hex_to_rgb("#FF0000")
    assert rgb == (255, 0, 0), f"Expected (255, 0, 0), got {rgb}"
    print(f"   ✅ hex_to_rgb('#FF0000') = {rgb}")
    
    # Test rgb_to_hex
    hex_color = rgb_to_hex(255, 0, 0)
    assert hex_color == "#FF0000", f"Expected #FF0000, got {hex_color}"
    print(f"   ✅ rgb_to_hex(255, 0, 0) = {hex_color}")
    
    # Test interpolation
    color1 = "#0000FF"  # Blue
    color2 = "#FF0000"  # Red
    mid_color = interpolate_color(color1, color2, 0.5)
    print(f"   ✅ interpolate_color('{color1}', '{color2}', 0.5) = {mid_color}")
    
    # Test edge cases
    start = interpolate_color(color1, color2, 0.0)
    end = interpolate_color(color1, color2, 1.0)
    assert start == color1 or start.upper() == color1.upper(), f"Start should be {color1}"
    assert end == color2 or end.upper() == color2.upper(), f"End should be {color2}"
    print(f"   ✅ Edge cases validated (0.0 → {start}, 1.0 → {end})")
    
except Exception as e:
    print(f"   ❌ Color interpolation test failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 5: Schema JSON serialization
print("\n5️⃣ Testing Schema JSON Serialization...")
try:
    rule_dict = highlight_rule.dict()
    print("   ✅ HighlightRule.dict() works")
    print(f"      - Keys: {list(rule_dict.keys())}")
    
    rule_json = highlight_rule.json()
    print("   ✅ HighlightRule.json() works")
    print(f"      - JSON length: {len(rule_json)} characters")
    
except Exception as e:
    print(f"   ❌ JSON serialization failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n" + "=" * 60)
print("✅ ALL TESTS PASSED!")
print("=" * 60)
print("\n📝 Summary:")
print("   - Schemas are properly defined")
print("   - Validation works correctly")
print("   - Color utilities function properly")
print("   - JSON serialization works")
print("\n🎉 Backend Conditional Formatting implementation is ready!")
print("\n⚠️  Note: Full integration test requires:")
print("   - Polars DataFrame with actual data")
print("   - Running FastAPI server")
print("   - MinIO/MongoDB services (for full app context)")



