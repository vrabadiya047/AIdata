"""
Unit tests for src/tools.py — safe_calculate and material_price.

No HTTP client or mocking needed; these are pure Python functions.
"""
import sys, types

# Stub llama_index before importing tools (FunctionTool is imported at module level)
for _p in ["llama_index", "llama_index.core", "llama_index.core.tools",
           "llama_index.core.schema"]:
    if _p not in sys.modules:
        m = types.ModuleType(_p)
        m.__path__ = []  # type: ignore
        sys.modules[_p] = m

from unittest.mock import MagicMock
sys.modules["llama_index.core.tools"].FunctionTool = MagicMock()  # type: ignore

from src.tools import safe_calculate, material_price


# ── safe_calculate ────────────────────────────────────────────────────────────

class TestSafeCalculate:
    def test_addition(self):
        assert safe_calculate("2 + 3") == "5"

    def test_subtraction(self):
        assert safe_calculate("10 - 4") == "6"

    def test_multiplication(self):
        assert safe_calculate("6 * 7") == "42"

    def test_division(self):
        assert safe_calculate("10 / 4") == "2.5"

    def test_power(self):
        assert safe_calculate("2 ** 10") == "1024"

    def test_modulo(self):
        assert safe_calculate("17 % 5") == "2"

    def test_parentheses(self):
        assert safe_calculate("(3 + 4) * 2") == "14"

    def test_float_result_whole_number(self):
        """1500.0 * 1 should return '1500', not '1500.0'."""
        assert safe_calculate("1500.0 * 1") == "1500"

    def test_float_mixed(self):
        result = safe_calculate("1500 * 12.5")
        assert result == "18750"

    def test_large_numbers(self):
        result = safe_calculate("1000000 * 750")
        assert result == "750000000"

    def test_nested_parens(self):
        assert safe_calculate("((2 + 3) * (4 - 1)) ** 2") == "225"

    def test_division_by_zero(self):
        result = safe_calculate("1 / 0")
        assert "zero" in result.lower()

    def test_invalid_syntax(self):
        result = safe_calculate("not valid python")
        assert result.lower().startswith("error")

    def test_string_literal_rejected(self):
        result = safe_calculate('"hello"')
        assert result.lower().startswith("error")

    def test_function_call_rejected(self):
        result = safe_calculate("__import__('os').system('ls')")
        assert result.lower().startswith("error")

    def test_variable_name_rejected_with_hint(self):
        result = safe_calculate("length * 142.75")
        assert result.lower().startswith("error")
        assert "length" in result
        assert "rag_search" in result

    def test_unary_negation(self):
        assert safe_calculate("-5 + 10") == "5"

    def test_whitespace_ignored(self):
        assert safe_calculate("  3  +  4  ") == "7"


# ── material_price ────────────────────────────────────────────────────────────

class TestMaterialPrice:
    def test_known_material_exact(self):
        result = material_price("steel")
        assert "750" in result
        assert "USD/tonne" in result

    def test_known_material_case_insensitive(self):
        result = material_price("STEEL")
        assert "750" in result

    def test_concrete_price(self):
        result = material_price("concrete")
        assert "120" in result
        assert "USD/m³" in result

    def test_aluminium_alias(self):
        """Both 'aluminum' and 'aluminium' should work."""
        r1 = material_price("aluminum")
        r2 = material_price("aluminium")
        # Price is formatted with commas: $2,400.00
        assert "2,400" in r1
        assert "2,400" in r2

    def test_fuzzy_match(self):
        """'structural steel' is an exact key — returns its own price."""
        result = material_price("structural steel")
        assert "800" in result

    def test_partial_substring_match(self):
        """Input containing a known material name triggers fuzzy match."""
        # 'copper pipe' contains 'copper' — should match 'copper' or 'copper pipe'
        result = material_price("copper pipe fitting")
        # Either 'copper pipe' ($8.50) or 'copper' ($9,500) could match — just verify lookup succeeded
        assert "No reference price found" not in result

    def test_unknown_material_lists_available(self):
        result = material_price("unobtainium")
        assert "No reference price found" in result
        assert "steel" in result.lower()

    def test_reference_disclaimer_present(self):
        result = material_price("copper")
        assert "reference" in result.lower()
        assert "verify" in result.lower()

    def test_rebar(self):
        result = material_price("rebar")
        assert "680" in result

    def test_glass(self):
        result = material_price("glass")
        assert "85" in result
        assert "USD/m²" in result
