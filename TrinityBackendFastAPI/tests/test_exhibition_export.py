import base64
import importlib.util
import io
import sys
import types
from pathlib import Path

import pytest
from PIL import Image


BACKEND_ROOT = Path(__file__).resolve().parents[1]
EXHIBITION_PATH = BACKEND_ROOT / "app" / "features" / "exhibition"


def _load_module(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader  # pragma: no cover - defensive
    sys.modules[module_name] = module
    spec.loader.exec_module(module)  # type: ignore[attr-defined]
    return module


# Create lightweight package hierarchy to satisfy relative imports without
# executing app.main side effects.
app_pkg = types.ModuleType("app")
app_pkg.__path__ = [str(BACKEND_ROOT / "app")]
features_pkg = types.ModuleType("app.features")
features_pkg.__path__ = [str(BACKEND_ROOT / "app" / "features")]
exhibition_pkg = types.ModuleType("app.features.exhibition")
exhibition_pkg.__path__ = [str(EXHIBITION_PATH)]

sys.modules.setdefault("app", app_pkg)
sys.modules.setdefault("app.features", features_pkg)
sys.modules.setdefault("app.features.exhibition", exhibition_pkg)

schemas_module = _load_module("app.features.exhibition.schemas", EXHIBITION_PATH / "schemas.py")
export_module = _load_module("app.features.exhibition.export", EXHIBITION_PATH / "export.py")

ExhibitionExportRequest = schemas_module.ExhibitionExportRequest
ExportGenerationError = export_module.ExportGenerationError
build_export_filename = export_module.build_export_filename
build_pdf_bytes = export_module.build_pdf_bytes
build_pptx_bytes = export_module.build_pptx_bytes


# 1x1 transparent PNG
def _png_data_url() -> str:
    buffer = io.BytesIO()
    Image.new("RGB", (10, 10), color="#3366FF").save(buffer, format="PNG")
    pixel = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{pixel}"


def _build_payload(include_screenshot: bool = True):
    screenshot = None
    if include_screenshot:
        screenshot = {
            "dataUrl": _png_data_url(),
            "width": 960,
            "height": 540,
            "cssWidth": 960,
            "cssHeight": 540,
            "pixelRatio": 2,
        }

    slides = [
        {
            "id": "slide-001",
            "index": 0,
            "title": "Overview",
            "baseWidth": 960,
            "baseHeight": 540,
            "objects": [
                {
                    "id": "text-001",
                    "type": "text-box",
                    "x": 120,
                    "y": 140,
                    "width": 400,
                    "height": 160,
                    "props": {
                        "text": "<strong>Hello</strong> world!",
                        "fontFamily": "Arial",
                        "fontSize": 24,
                        "align": "center",
                    },
                },
                {
                    "id": "image-001",
                    "type": "image",
                    "x": 560,
                    "y": 200,
                    "width": 120,
                    "height": 120,
                    "props": {"src": _png_data_url()},
                },
            ],
            "screenshot": screenshot,
        },
        {
            "id": "slide-002",
            "index": 1,
            "title": "Fallback Dimensions",
            "baseWidth": 0,
            "baseHeight": 0,
            "objects": [],
            "screenshot": screenshot,
        },
    ]

    return ExhibitionExportRequest.model_validate({"title": "Demo", "slides": slides})


def test_build_pptx_bytes_renders_slides(tmp_path: Path) -> None:
    payload = _build_payload()

    pptx_bytes = build_pptx_bytes(payload)
    assert pptx_bytes.startswith(b"PK")

    from pptx import Presentation

    presentation = Presentation(io.BytesIO(pptx_bytes))
    assert len(presentation.slides) == 2

    text_shapes = [
        shape
        for shape in presentation.slides[0].shapes
        if hasattr(shape, "text") and "Hello" in shape.text
    ]
    assert text_shapes, "Expected text box to contain exported content"


def test_build_pdf_bytes_requires_screenshots() -> None:
    payload = _build_payload(include_screenshot=True)
    pdf_bytes = build_pdf_bytes(payload)
    assert pdf_bytes.startswith(b"%PDF")

    payload_missing = _build_payload(include_screenshot=False)
    with pytest.raises(ExportGenerationError):
        build_pdf_bytes(payload_missing)


def test_build_export_filename_normalises_title() -> None:
    name = build_export_filename(" Quarterly Results 2024 / Demo  ", "pptx")
    assert name == "quarterly-results-2024-demo.pptx"

    fallback = build_export_filename(None, "pdf")
    assert fallback == "exhibition-export.pdf"
