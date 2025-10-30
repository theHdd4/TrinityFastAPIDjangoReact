from __future__ import annotations

import base64
import contextlib
import logging
import math
import subprocess
import sys
import threading
from dataclasses import dataclass
from typing import Iterable, List, Optional
from urllib.parse import urljoin

from .schemas import DocumentStylesPayload

logger = logging.getLogger(__name__)

try:  # pragma: no cover - optional dependency
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import Browser, sync_playwright
except ImportError:  # pragma: no cover - executed when playwright is missing
    PlaywrightTimeoutError = None  # type: ignore[assignment]
    Browser = None  # type: ignore[assignment]
    sync_playwright = None  # type: ignore[assignment]


_browser_install_lock = threading.Lock()
_browser_install_ready = False


class ExhibitionRendererError(RuntimeError):
    """Raised when the exhibition renderer is unable to capture a slide."""


@dataclass(slots=True)
class SlideRenderInput:
    """Simple container describing a slide that should be rendered."""

    id: str
    html: str
    width: float
    height: float
    pixel_ratio: Optional[float] = None

    @property
    def viewport_width(self) -> int:
        return max(1, int(math.ceil(self.width)))

    @property
    def viewport_height(self) -> int:
        return max(1, int(math.ceil(self.height)))

    def effective_pixel_ratio(self, fallback: Optional[float] = None) -> float:
        ratio = self.pixel_ratio if self.pixel_ratio and self.pixel_ratio > 0 else None
        if ratio is None and fallback and fallback > 0:
            ratio = fallback
        if ratio is None:
            ratio = 1.0
        return float(max(ratio, 1.0))


@dataclass(slots=True)
class RenderedSlide:
    """Rendered slide metadata returned to the export pipeline."""

    id: str
    data_url: str
    width: int
    height: int
    css_width: float
    css_height: float
    pixel_ratio: float

    def as_payload(self) -> dict[str, object]:
        return {
            "id": self.id,
            "dataUrl": self.data_url,
            "width": self.width,
            "height": self.height,
            "cssWidth": self.css_width,
            "cssHeight": self.css_height,
            "pixelRatio": self.pixel_ratio,
        }


def _ensure_playwright_available() -> None:
    if sync_playwright is None:  # pragma: no cover - executed when dependency missing
        raise ExhibitionRendererError(
            "Playwright is not installed. Install the 'playwright' package and run "
            "'playwright install chromium' to enable server-side slide rendering."
        )


def _should_attempt_browser_install(exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        "playwright install" in message
        or "executable doesn't exist" in message
        or "looks like playwright" in message
    )


def _install_playwright_chromium() -> None:
    global _browser_install_ready

    with _browser_install_lock:
        if _browser_install_ready:
            return

        logger.info("Attempting to install Playwright chromium browser automatically.")
        try:
            completed = subprocess.run(
                [sys.executable, "-m", "playwright", "install", "chromium"],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
        except FileNotFoundError as exc:  # pragma: no cover - python missing?
            raise ExhibitionRendererError(
                "Unable to install chromium for Playwright: Python executable not found."
            ) from exc
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or exc.stdout or "").strip()
            if stderr:
                logger.error("Playwright chromium installation failed: %s", stderr)
            raise ExhibitionRendererError(
                "Unable to install chromium for Playwright automatically."
            ) from exc

        stdout = (completed.stdout or "").strip()
        if stdout:
            logger.debug("Playwright install output: %s", stdout)

        _browser_install_ready = True


def _compose_document(slide: SlideRenderInput, styles: DocumentStylesPayload) -> str:
    head_parts: List[str] = [
        "<meta charset=\"utf-8\">",
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
        "<style>html,body{margin:0;padding:0;background:transparent;}</style>",
    ]

    for css in styles.inline or []:
        css_content = (css or "").strip()
        if css_content:
            head_parts.append(f"<style>{css_content}</style>")

    base_url = (styles.base_url or "").strip()
    for href in styles.external or []:
        url = (href or "").strip()
        if not url:
            continue
        if base_url and not url.lower().startswith(("http://", "https://", "data:")):
            url = urljoin(base_url, url)
        head_parts.append(f'<link rel="stylesheet" href="{url}">')

    slide_markup = slide.html if slide.html else ""

    return (
        "<!DOCTYPE html><html><head>"
        + "".join(head_parts)
        + "</head><body>"
        + f'<div id="slide-root" style="width:{slide.width}px;height:{slide.height}px">{slide_markup}</div>'
        + "</body></html>"
    )


class ExhibitionRenderer:
    """Thin wrapper around Playwright used to capture exhibition slides."""

    def __init__(self, *, headless: bool = True) -> None:
        self._play = None
        self._browser: Optional[Browser] = None
        self._headless = headless

    def __enter__(self) -> "ExhibitionRenderer":
        _ensure_playwright_available()
        self._play = sync_playwright().start()
        install_attempted = False
        while True:
            try:
                self._browser = self._play.chromium.launch(
                    headless=self._headless,
                    args=["--font-render-hinting=medium", "--disable-dev-shm-usage"],
                )
                break
            except Exception as exc:  # pragma: no cover - playwright startup edge cases
                if not install_attempted and _should_attempt_browser_install(exc):
                    _install_playwright_chromium()
                    install_attempted = True
                    continue
                raise ExhibitionRendererError(f"Unable to start chromium renderer: {exc}") from exc
        return self

    def __exit__(self, exc_type, exc, tb) -> None:  # pragma: no cover - cleanup robustness
        if self._browser is not None:
            with contextlib.suppress(Exception):
                self._browser.close()
        if self._play is not None:
            with contextlib.suppress(Exception):
                self._play.stop()

    def render_slides(
        self,
        slides: Iterable[SlideRenderInput],
        styles: DocumentStylesPayload,
        *,
        pixel_ratio: Optional[float] = None,
        timeout_ms: int = 15000,
    ) -> list[RenderedSlide]:
        if self._browser is None:
            raise ExhibitionRendererError("Renderer has not been initialised.")

        rendered: list[RenderedSlide] = []
        for slide in slides:
            ratio = slide.effective_pixel_ratio(pixel_ratio)
            viewport = {
                "width": slide.viewport_width,
                "height": slide.viewport_height,
                "device_scale_factor": ratio,
            }

            try:
                page = self._browser.new_page(
                    viewport={"width": viewport["width"], "height": viewport["height"]},
                    device_scale_factor=viewport["device_scale_factor"],
                )
            except Exception as exc:  # pragma: no cover - playwright edge cases
                raise ExhibitionRendererError(
                    f"Unable to allocate a browser page for slide {slide.id}: {exc}"
                ) from exc

            try:
                html = _compose_document(slide, styles)
                page.set_content(html, wait_until="networkidle")
                if PlaywrightTimeoutError is not None:
                    try:
                        page.wait_for_function(
                            "(window.document.fonts && window.document.fonts.status === 'loaded') || !window.document.fonts",
                            timeout=timeout_ms,
                        )
                    except PlaywrightTimeoutError:  # pragma: no cover - slow font load
                        logger.debug("Timed out waiting for fonts when rendering slide %s", slide.id)
                page.wait_for_timeout(100)

                screenshot_bytes = page.screenshot(type="png", full_page=False)
            except Exception as exc:
                raise ExhibitionRendererError(
                    f"Unable to capture screenshot for slide {slide.id}: {exc}"
                ) from exc
            finally:
                with contextlib.suppress(Exception):
                    page.close()

            encoded = base64.b64encode(screenshot_bytes).decode("ascii")
            rendered.append(
                RenderedSlide(
                    id=slide.id,
                    data_url=f"data:image/png;base64,{encoded}",
                    width=int(round(slide.viewport_width * ratio)),
                    height=int(round(slide.viewport_height * ratio)),
                    css_width=float(slide.width),
                    css_height=float(slide.height),
                    pixel_ratio=ratio,
                )
            )

        return rendered


def render_slide_batch(
    slides: Iterable[SlideRenderInput],
    styles: DocumentStylesPayload,
    *,
    pixel_ratio: Optional[float] = None,
) -> list[RenderedSlide]:
    """Convenience helper used by the export pipeline to capture slides."""

    slide_list = list(slides)
    if not slide_list:
        return []

    with ExhibitionRenderer() as renderer:
        return renderer.render_slides(slide_list, styles, pixel_ratio=pixel_ratio)


def build_inputs(raw_slides: Iterable[dict[str, object]]) -> list[SlideRenderInput]:
    inputs: list[SlideRenderInput] = []
    for entry in raw_slides:
        try:
            slide_id = str(entry["id"])
            html = str(entry.get("html", ""))
            width = float(entry.get("width", 0) or 0)
            height = float(entry.get("height", 0) or 0)
        except (KeyError, TypeError, ValueError) as exc:
            raise ExhibitionRendererError(
                f"Rendering payload is missing required fields: {exc}"
            ) from exc

        if width <= 0 or height <= 0:
            raise ExhibitionRendererError(
                f"Slide {slide_id} does not include valid dimensions for rendering."
            )

        pixel_ratio_value = entry.get("pixelRatio")
        try:
            ratio = float(pixel_ratio_value) if pixel_ratio_value is not None else None
        except (TypeError, ValueError):
            ratio = None

        inputs.append(
            SlideRenderInput(
                id=slide_id,
                html=html,
                width=width,
                height=height,
                pixel_ratio=ratio,
            )
        )

    return inputs

