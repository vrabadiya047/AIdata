# src/tools.py
"""Local Python tools made available to the ReActAgent."""
import ast
import operator
from typing import List

from llama_index.core.tools import FunctionTool

# ── Safe arithmetic evaluator ─────────────────────────────────────────────────

_OPS = {
    ast.Add:  operator.add,
    ast.Sub:  operator.sub,
    ast.Mult: operator.mul,
    ast.Div:  operator.truediv,
    ast.Pow:  operator.pow,
    ast.Mod:  operator.mod,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _eval(node):
    if isinstance(node, ast.Constant):
        if not isinstance(node.value, (int, float)):
            raise ValueError("Non-numeric literal")
        return node.value
    if isinstance(node, ast.BinOp):
        return _OPS[type(node.op)](_eval(node.left), _eval(node.right))
    if isinstance(node, ast.UnaryOp):
        return _OPS[type(node.op)](_eval(node.operand))
    if isinstance(node, ast.Name):
        raise ValueError(
            f"Variable name '{node.id}' is not allowed — only plain numbers are supported. "
            f"Use rag_search to find the numeric value of '{node.id}', then call calculate "
            f"with the actual number (e.g. calculate('1485 * 142.75'))."
        )
    raise ValueError(f"Unsupported expression node: {type(node).__name__}")


def safe_calculate(expression: str) -> str:
    """Evaluate a mathematical expression containing ONLY numbers and operators.

    IMPORTANT: The expression must use literal numbers only — no variable names.
    If you need to multiply a quantity from a document, first use rag_search to
    find the exact number, then pass it directly here.

    Supports: +  -  *  /  **  %  and parentheses.
    Returns the numeric result as a string, or an error message.

    Good:  safe_calculate("1485 * 142.75")   → "211,863.75"
    Good:  safe_calculate("(3 + 4) ** 2")    → "49"
    Bad:   safe_calculate("length * 142.75") → Error (no variable names)
    """
    try:
        tree = ast.parse(expression.strip(), mode="eval")
        result = _eval(tree.body)
        if isinstance(result, float) and result == int(result):
            result = int(result)
        return str(result)
    except ZeroDivisionError:
        return "Error: division by zero"
    except (KeyError, ValueError) as exc:
        return f"Error: unsupported expression — {exc}"
    except SyntaxError:
        return f"Error: invalid syntax in '{expression}'"


# ── Material reference price table ────────────────────────────────────────────
# Local reference prices — no external APIs required.
# Format: {material_name: (unit, price_per_unit)}
_PRICES: dict[str, tuple[str, float]] = {
    "steel":               ("USD/tonne",  750.0),
    "structural steel":    ("USD/tonne",  800.0),
    "mild steel":          ("USD/tonne",  700.0),
    "stainless steel":     ("USD/tonne", 2200.0),
    "aluminum":            ("USD/tonne", 2400.0),
    "aluminium":           ("USD/tonne", 2400.0),
    "copper":              ("USD/tonne", 9500.0),
    "brass":               ("USD/tonne", 6200.0),
    "concrete":            ("USD/m³",     120.0),
    "reinforced concrete": ("USD/m³",     180.0),
    "timber":              ("USD/m³",     450.0),
    "lumber":              ("USD/m³",     450.0),
    "plywood":             ("USD/m³",     650.0),
    "glass":               ("USD/m²",      85.0),
    "tempered glass":      ("USD/m²",     160.0),
    "rebar":               ("USD/tonne",  680.0),
    "cement":              ("USD/tonne",  130.0),
    "sand":                ("USD/tonne",   25.0),
    "gravel":              ("USD/tonne",   30.0),
    "brick":               ("USD/1000",   900.0),
    "insulation":          ("USD/m²",      18.0),
    "copper pipe":         ("USD/m",        8.5),
    "pvc pipe":            ("USD/m",        2.5),
}


def material_price(material: str) -> str:
    """Look up the reference market price for an engineering or construction material.

    Returns the price per unit with the unit name.
    Example: material_price("steel") → "steel: $750.00 USD/tonne (reference price)"
    """
    key = material.lower().strip()
    if key in _PRICES:
        unit, price = _PRICES[key]
        return f"{material}: ${price:,.2f} {unit} (local reference price — verify before use)"
    for name, (unit, price) in _PRICES.items():
        if name in key or key in name:
            return f"{name}: ${price:,.2f} {unit} (local reference price — verify before use)"
    available = ", ".join(_PRICES.keys())
    return f"No reference price found for '{material}'. Available: {available}"


# ── RAG tool factory (binds to user's retriever at agent creation time) ───────

def make_rag_tool(retriever, postprocessors: List) -> FunctionTool:
    """Return a FunctionTool that searches the user's indexed documents."""
    from llama_index.core.schema import QueryBundle

    def rag_search(query: str) -> str:
        """Search the user's uploaded documents for information relevant to the query.

        Returns the most relevant text passages from the documents, with source names.
        Use this whenever the user's question refers to uploaded files or specifications.
        """
        try:
            qb = QueryBundle(query)
            nodes = retriever.retrieve(query)
            for pp in postprocessors:
                nodes = pp.postprocess_nodes(nodes, query_bundle=qb)
        except Exception as exc:
            return f"Search failed: {exc}"
        if not nodes:
            return "No relevant information found in uploaded documents."
        parts = []
        for i, n in enumerate(nodes[:5], 1):
            meta = getattr(n.node, "metadata", {}) or {}
            src = meta.get("file_name") or meta.get("filename") or "document"
            text = n.node.get_content()[:600].strip()
            parts.append(f"[{i}] From '{src}':\n{text}")
        return "\n\n".join(parts)

    return FunctionTool.from_defaults(fn=rag_search, name="rag_search")


# ── Stateless tool singletons ─────────────────────────────────────────────────
calculate_tool = FunctionTool.from_defaults(fn=safe_calculate, name="calculate")
price_tool     = FunctionTool.from_defaults(fn=material_price, name="material_price")
