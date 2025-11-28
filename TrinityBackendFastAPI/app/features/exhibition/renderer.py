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

STATIC_CAPTURE_ATTRIBUTE = "data-exhibition-export-static"
STATIC_CAPTURE_STYLE = (
    f"[{STATIC_CAPTURE_ATTRIBUTE}] *,"
    f"[{STATIC_CAPTURE_ATTRIBUTE}] *::before,"
    f"[{STATIC_CAPTURE_ATTRIBUTE}] *::after {{"
    "animation: none !important;"
    "animation-delay: 0s !important;"
    "animation-duration: 0s !important;"
    "animation-play-state: paused !important;"
    "transition-property: none !important;"
    "transition-duration: 0s !important;"
    "transition-delay: 0s !important;"
    "}"
)


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
        # CRITICAL: Reset all transforms on slide-root and children
        # This ensures slides are captured at base dimensions, not transformed/scaled
        # Essential for horizontal navigation where slides may have CSS transforms
        "<style>"
        "#slide-root, #slide-root * {"
        "  transform: none !important;"
        "  transform-origin: top left !important;"
        "}"
        "#slide-root {"
        "  position: absolute !important;"
        "  top: 0 !important;"
        "  left: 0 !important;"
        "  margin: 0 !important;"
        "  padding: 0 !important;"
        "}"
        "</style>",
    ]

    head_parts.append(f"<style>{''.join(STATIC_CAPTURE_STYLE)}</style>")

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

    # CRITICAL: Ensure HTML structure positions slide-root at 0,0 with exact dimensions
    # This is essential for reliable screenshot capture, especially for multiple slides
    slide_width_px = int(math.ceil(slide.width))
    slide_height_px = int(math.ceil(slide.height))

    return (
        "<!DOCTYPE html><html style=\"margin:0;padding:0;width:100%;height:100%;overflow:hidden;\"><head>"
        + "".join(head_parts)
        + "</head><body style=\"margin:0;padding:0;width:100%;height:100%;overflow:hidden;position:relative;box-sizing:border-box;\">"
        + f'<div id="slide-root" style="width:{slide_width_px}px;height:{slide_height_px}px;margin:0;padding:0;position:absolute;top:0;left:0;box-sizing:border-box;overflow:visible;min-width:{slide_width_px}px;min-height:{slide_height_px}px;">{slide_markup}</div>'
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
        slide_count = len(list(slides)) if hasattr(slides, '__len__') else None
        slide_index = 0
        
        for slide in slides:
            slide_index += 1
            if slide_count:
                logger.info("Processing slide %d/%d: %s", slide_index, slide_count, slide.id)
            else:
                logger.info("Processing slide: %s", slide.id)
            
            ratio = slide.effective_pixel_ratio(pixel_ratio)
            viewport = {
                "width": slide.viewport_width,
                "height": slide.viewport_height,
                "device_scale_factor": ratio,
            }

            # CRITICAL: Set viewport to match slide dimensions from the start
            # This ensures the page is sized correctly from the beginning
            # Each slide gets its own viewport size - important for multiple slides
            slide_viewport_width = max(viewport["width"], int(math.ceil(slide.width)))
            slide_viewport_height = max(viewport["height"], int(math.ceil(slide.height)))
            
            # CRITICAL: Create a NEW browser context for each slide
            # This provides complete isolation, just like when processing a single slide
            # Browser contexts are more isolated than pages - they don't share state
            # This is the key difference that makes single slides work but multiple slides fail
            context = None
            page = None
            try:
                # Create a fresh browser context for each slide
                # This ensures complete isolation - no state leakage between slides
                context = self._browser.new_context(
                    viewport={"width": slide_viewport_width, "height": slide_viewport_height},
                    device_scale_factor=viewport["device_scale_factor"],
                )
                logger.debug("Created new browser context for slide %s with viewport %dx%d", slide.id, slide_viewport_width, slide_viewport_height)
                
                # Create a page within this isolated context
                page = context.new_page()
                logger.debug("Created new page in context for slide %s", slide.id)
            except Exception as exc:  # pragma: no cover - playwright edge cases
                raise ExhibitionRendererError(
                    f"Unable to allocate a browser page for slide {slide.id}: {exc}"
                ) from exc

            try:
                html = _compose_document(slide, styles)
                page.set_content(html, wait_until="networkidle")
                
                # CRITICAL: Reset CSS transforms on slide-root and all children
                # This is essential for horizontal navigation where slides may be scaled/translated
                # We need to capture at base dimensions (scale=1, translate=0) for accurate screenshots
                page.evaluate("""
                    () => {
                        const root = document.getElementById('slide-root');
                        if (root) {
                            // Reset transforms on slide-root
                            root.style.transform = 'none';
                            root.style.transformOrigin = 'top left';
                            root.style.margin = '0';
                            root.style.padding = '0';
                            root.style.position = 'absolute';
                            root.style.top = '0';
                            root.style.left = '0';
                            root.style.right = 'auto';
                            root.style.bottom = 'auto';
                            
                            // Reset transforms on all children that might have transforms
                            const allElements = root.querySelectorAll('*');
                            allElements.forEach(el => {
                                const computed = window.getComputedStyle(el);
                                const transform = computed.transform;
                                if (transform && transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)') {
                                    // Only reset if there's an actual transform
                                    el.style.transform = 'none';
                                    el.style.transformOrigin = 'top left';
                                }
                            });
                        }
                        
                        // Disable chart animations
                        window.__disableChartAnimations = true;
                        window.dispatchEvent(new CustomEvent('disable-chart-animations'));
                    }
                """)
                logger.debug("CSS transforms reset and chart animations disabled for slide %s", slide.id)
                
                if PlaywrightTimeoutError is not None:
                    try:
                        page.wait_for_function(
                            "(window.document.fonts && window.document.fonts.status === 'loaded') || !window.document.fonts",
                            timeout=timeout_ms,
                        )
                    except PlaywrightTimeoutError:  # pragma: no cover - slow font load
                        logger.debug("Timed out waiting for fonts when rendering slide %s", slide.id)
                
                # ROBUST CHART RENDERING WAIT: Direct SVG content validation
                # Since animations are disabled, charts should render immediately
                # But we still need to wait for actual content to appear
                try:
                    logger.info("Waiting for chart rendering completion on slide %s (animations disabled)", slide.id)
                    
                    # Wait for charts to have actual rendered content
                    # With animations disabled, this should be faster
                    page.wait_for_function(
                        """
                        () => {
                            const charts = document.querySelectorAll('[data-exhibition-chart-root="true"]');
                            if (charts.length === 0) {
                                return true; // No charts, proceed
                            }
                            
                            let allChartsReady = true;
                            
                            charts.forEach(chart => {
                                const svg = chart.querySelector('svg');
                                if (!svg) {
                                    allChartsReady = false;
                                    return;
                                }
                                
                                // Check for actual chart content
                                const paths = svg.querySelectorAll('path');
                                const bars = svg.querySelectorAll('.recharts-bar, rect[class*="bar"]');
                                const lines = svg.querySelectorAll('.recharts-line, line');
                                const pie = svg.querySelectorAll('.recharts-pie, circle');
                                const text = svg.querySelectorAll('text');
                                
                                // Chart must have meaningful content
                                let hasContent = false;
                                
                                // Check paths have actual data
                                if (paths.length > 0) {
                                    for (const path of Array.from(paths)) {
                                        const d = path.getAttribute('d') || '';
                                        if (d.length > 20) { // Meaningful path data
                                            hasContent = true;
                                            break;
                                        }
                                    }
                                }
                                
                                // Check for other chart elements
                                if (!hasContent) {
                                    hasContent = bars.length > 0 || lines.length > 0 || 
                                                pie.length > 0 || text.length > 5; // At least some labels
                                }
                                
                                if (!hasContent) {
                                    allChartsReady = false;
                                }
                            });
                            
                            return allChartsReady;
                        }
                        """,
                        timeout=15000,  # Reduced timeout since animations are disabled
                    )
                    logger.info("Charts have content on slide %s", slide.id)
                    
                    # With animations disabled, charts should be stable immediately
                    # Just wait a small buffer for any final rendering
                    page.wait_for_timeout(1000)
                    logger.info("Charts are ready on slide %s (animations disabled, instant render)", slide.id)
                    
                except PlaywrightTimeoutError:
                    logger.warning(
                        "Timed out waiting for chart rendering on slide %s, proceeding anyway",
                        slide.id
                    )
                    # Small buffer even on timeout
                    page.wait_for_timeout(1000)
                
                # CRITICAL: Use slide dimensions directly for reliable capture
                # For multiple slides, using measured dimensions can be unreliable
                # Instead, use the slide's declared dimensions which are accurate
                capture_width = int(math.ceil(slide.width))
                capture_height = int(math.ceil(slide.height))
                
                # Ensure dimensions are valid
                if capture_width <= 0:
                    capture_width = slide_viewport_width
                if capture_height <= 0:
                    capture_height = slide_viewport_height
                
                # CRITICAL: Robust geometry validation and viewport setup for batch processing
                # This ensures each slide is captured correctly, especially in multi-slide batches
                
                # Step 1: Set viewport to exact slide dimensions
                logger.info(
                    "Setting viewport for slide %s to exact slide dimensions: %dx%d (slide: %fx%f)",
                    slide.id,
                    capture_width,
                    capture_height,
                    slide.width,
                    slide.height,
                )
                page.set_viewport_size(width=capture_width, height=capture_height)
                page.wait_for_timeout(500)  # Wait for viewport resize
                
                # Step 2: Validate and measure actual geometry AFTER transform reset
                # CRITICAL: Re-verify transforms are reset and measure base dimensions
                geometry = page.evaluate("""
                    () => {
                        const root = document.getElementById('slide-root');
                        if (!root) {
                            return { 
                                found: false,
                                error: 'slide-root not found',
                                viewportWidth: window.innerWidth,
                                viewportHeight: window.innerHeight
                            };
                        }
                        
                        // Ensure transforms are still reset (defensive check)
                        const computed = window.getComputedStyle(root);
                        const transform = computed.transform;
                        const hasTransform = transform && transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)';
                        
                        if (hasTransform) {
                            // Force reset if transform still exists
                            root.style.transform = 'none';
                            root.style.transformOrigin = 'top left';
                        }
                        
                        const rect = root.getBoundingClientRect();
                        
                        return {
                            found: true,
                            // Element position and size (should be at 0,0 after transform reset)
                            x: Math.round(rect.x),
                            y: Math.round(rect.y),
                            width: Math.round(rect.width),
                            height: Math.round(rect.height),
                            // Element dimensions (base dimensions, not transformed)
                            offsetWidth: root.offsetWidth,
                            offsetHeight: root.offsetHeight,
                            clientWidth: root.clientWidth,
                            clientHeight: root.clientHeight,
                            scrollWidth: root.scrollWidth,
                            scrollHeight: root.scrollHeight,
                            // Viewport dimensions
                            viewportWidth: window.innerWidth,
                            viewportHeight: window.innerHeight,
                            // Body dimensions
                            bodyWidth: document.body.scrollWidth,
                            bodyHeight: document.body.scrollHeight,
                            // Computed styles
                            marginTop: parseFloat(computed.marginTop) || 0,
                            marginLeft: parseFloat(computed.marginLeft) || 0,
                            paddingTop: parseFloat(computed.paddingTop) || 0,
                            paddingLeft: parseFloat(computed.paddingLeft) || 0,
                            // Transform info for debugging
                            hasTransform: hasTransform,
                            transform: transform || 'none',
                        };
                    }
                """)
                
                if not geometry.get('found', False):
                    raise ExhibitionRendererError(
                        f"slide-root element not found for slide {slide.id}"
                    )
                
                # Step 3: Validate geometry and detect mismatches
                viewport_w = geometry.get('viewportWidth', 0)
                viewport_h = geometry.get('viewportHeight', 0)
                element_x = geometry.get('x', 0)
                element_y = geometry.get('y', 0)
                element_w = geometry.get('width', 0)
                element_h = geometry.get('height', 0)
                scroll_w = geometry.get('scrollWidth', 0)
                scroll_h = geometry.get('scrollHeight', 0)
                
                # Log transform status for debugging
                has_transform = geometry.get('hasTransform', False)
                transform_value = geometry.get('transform', 'none')
                
                logger.info(
                    "Slide %s geometry: element at (%d,%d) size %dx%d (scroll: %dx%d), viewport %dx%d, transform: %s",
                    slide.id,
                    element_x,
                    element_y,
                    element_w,
                    element_h,
                    scroll_w,
                    scroll_h,
                    viewport_w,
                    viewport_h,
                    transform_value,
                )
                
                # Warn if element is not at (0,0) - this indicates transform issues
                if element_x != 0 or element_y != 0:
                    logger.warning(
                        "Slide %s: element not at (0,0) after transform reset, found at (%d,%d). This may cause cropping.",
                        slide.id,
                        element_x,
                        element_y,
                    )
                    # Force position to (0,0)
                    page.evaluate("""
                        () => {
                            const root = document.getElementById('slide-root');
                            if (root) {
                                root.style.position = 'absolute';
                                root.style.top = '0';
                                root.style.left = '0';
                                root.style.transform = 'none';
                            }
                        }
                    """)
                    page.wait_for_timeout(100)  # Wait for style update
                
                # Step 4: Detect and fix geometry mismatches
                needs_viewport_adjust = False
                final_capture_width = capture_width
                final_capture_height = capture_height
                
                # Check if element is not at (0,0) - this indicates positioning issues
                if element_x != 0 or element_y != 0:
                    logger.warning(
                        "Slide %s: element not at (0,0), found at (%d,%d). This may cause cropping.",
                        slide.id,
                        element_x,
                        element_y,
                    )
                    # Adjust capture to account for offset
                    final_capture_width = max(capture_width, element_x + element_w)
                    final_capture_height = max(capture_height, element_y + element_h)
                    needs_viewport_adjust = True
                
                # Check if element size doesn't match expected dimensions
                size_tolerance = 5  # Allow 5px tolerance for rounding
                if abs(element_w - capture_width) > size_tolerance or abs(element_h - capture_height) > size_tolerance:
                    logger.warning(
                        "Slide %s: element size mismatch. Expected %dx%d, got %dx%d",
                        slide.id,
                        capture_width,
                        capture_height,
                        element_w,
                        element_h,
                    )
                    # Use actual element size
                    final_capture_width = max(capture_width, element_w, scroll_w)
                    final_capture_height = max(capture_height, element_h, scroll_h)
                    needs_viewport_adjust = True
                
                # Check if scroll size is larger than viewport (content overflow)
                if scroll_w > viewport_w or scroll_h > viewport_h:
                    logger.warning(
                        "Slide %s: content overflow detected. Scroll %dx%d > viewport %dx%d",
                        slide.id,
                        scroll_w,
                        scroll_h,
                        viewport_w,
                        viewport_h,
                    )
                    final_capture_width = max(final_capture_width, scroll_w)
                    final_capture_height = max(final_capture_height, scroll_h)
                    needs_viewport_adjust = True
                
                # Step 5: Adjust viewport if needed
                if needs_viewport_adjust:
                    logger.info(
                        "Adjusting viewport for slide %s: %dx%d -> %dx%d",
                        slide.id,
                        viewport_w,
                        viewport_h,
                        final_capture_width,
                        final_capture_height,
                    )
                    page.set_viewport_size(width=final_capture_width, height=final_capture_height)
                    page.wait_for_timeout(500)  # Wait for resize
                    
                    # Re-verify after adjustment
                    geometry_after = page.evaluate("""
                        () => {
                            const root = document.getElementById('slide-root');
                            if (!root) return { found: false };
                            const rect = root.getBoundingClientRect();
                            return {
                                found: true,
                                x: Math.round(rect.x),
                                y: Math.round(rect.y),
                                width: Math.round(rect.width),
                                height: Math.round(rect.height),
                                viewportWidth: window.innerWidth,
                                viewportHeight: window.innerHeight,
                            };
                        }
                    """)
                    
                    logger.info(
                        "Slide %s after adjustment: element at (%d,%d) size %dx%d, viewport %dx%d",
                        slide.id,
                        geometry_after.get('x', 0),
                        geometry_after.get('y', 0),
                        geometry_after.get('width', 0),
                        geometry_after.get('height', 0),
                        geometry_after.get('viewportWidth', 0),
                        geometry_after.get('viewportHeight', 0),
                    )
                    
                    # Update capture dimensions
                    capture_width = final_capture_width
                    capture_height = final_capture_height
                
                # Step 6: Capture screenshot with explicit clip coordinates
                # Use explicit clip to ensure we capture exactly what we want
                # This is more reliable than full_page=False for batch processing
                # CRITICAL: For horizontal slides, ensure we capture full width
                
                # Get final viewport dimensions after any adjustments
                final_viewport = page.evaluate("""
                    () => ({
                        width: window.innerWidth,
                        height: window.innerHeight,
                        scrollWidth: document.documentElement.scrollWidth,
                        scrollHeight: document.documentElement.scrollHeight
                    })
                """)
                final_viewport_w = final_viewport.get('width', capture_width)
                final_viewport_h = final_viewport.get('height', capture_height)
                scroll_w = final_viewport.get('scrollWidth', capture_width)
                scroll_h = final_viewport.get('scrollHeight', capture_height)
                
                # CRITICAL: For horizontal slides (landscape), ensure viewport is wide enough
                # Use the maximum of: requested width, element width, scroll width
                effective_width = max(capture_width, element_w, scroll_w)
                effective_height = max(capture_height, element_h, scroll_h)
                
                # If viewport is smaller than needed, expand it (especially for horizontal slides)
                if effective_width > final_viewport_w or effective_height > final_viewport_h:
                    logger.info(
                        "Expanding viewport for slide %s (horizontal/wide layout): %dx%d -> %dx%d",
                        slide.id,
                        final_viewport_w,
                        final_viewport_h,
                        effective_width,
                        effective_height,
                    )
                    page.set_viewport_size(width=effective_width, height=effective_height)
                    page.wait_for_timeout(500)  # Wait for resize
                    
                    # Re-measure after expansion
                    final_viewport = page.evaluate("""
                        () => ({
                            width: window.innerWidth,
                            height: window.innerHeight
                        })
                    """)
                    final_viewport_w = final_viewport.get('width', effective_width)
                    final_viewport_h = final_viewport.get('height', effective_height)
                    
                    # Update capture dimensions
                    capture_width = effective_width
                    capture_height = effective_height
                
                # Calculate clip coordinates - ensure we capture the full slide
                # For horizontal slides, element should be at (0,0) and we capture full width
                clip_x = max(0, element_x)  # Ensure non-negative
                clip_y = max(0, element_y)
                
                # CRITICAL: For horizontal slides, use the full capture width/height
                # Don't limit by viewport - we've already ensured viewport is large enough
                # This is especially important for wide landscape slides
                clip_width = capture_width
                clip_height = capture_height
                
                # Only limit if we're offset from (0,0) and viewport is smaller
                if clip_x > 0 and (clip_x + clip_width) > final_viewport_w:
                    clip_width = final_viewport_w - clip_x
                if clip_y > 0 and (clip_y + clip_height) > final_viewport_h:
                    clip_height = final_viewport_h - clip_y
                
                # Ensure clip dimensions are valid and match slide dimensions
                if clip_width <= 0:
                    clip_width = capture_width
                if clip_height <= 0:
                    clip_height = capture_height
                
                # Final validation: clip should match slide dimensions for horizontal slides
                # Log orientation for debugging
                is_horizontal = capture_width > capture_height
                orientation = "horizontal (landscape)" if is_horizontal else "vertical (portrait)"
                logger.info(
                    "Slide %s orientation: %s, dimensions: %dx%d",
                    slide.id,
                    orientation,
                    capture_width,
                    capture_height,
                )
                
                logger.info(
                    "Capturing slide %s with clip: x=%d, y=%d, width=%d, height=%d",
                    slide.id,
                    clip_x,
                    clip_y,
                    clip_width,
                    clip_height,
                )
                
                screenshot_bytes = page.screenshot(
                    type="png",
                    clip={
                        "x": clip_x,
                        "y": clip_y,
                        "width": clip_width,
                        "height": clip_height,
                    },
                )
                
                # Step 7: Validate captured image dimensions (optional, for debugging)
                try:
                    from PIL import Image
                    import io
                    with io.BytesIO(screenshot_bytes) as img_stream:
                        with Image.open(img_stream) as img:
                            actual_img_width, actual_img_height = img.size
                            if actual_img_width != clip_width or actual_img_height != clip_height:
                                logger.warning(
                                    "Slide %s: captured image size mismatch. Expected %dx%d, got %dx%d",
                                    slide.id,
                                    clip_width,
                                    clip_height,
                                    actual_img_width,
                                    actual_img_height,
                                )
                except ImportError:
                    # PIL not available, skip validation
                    pass
                except Exception as img_exc:
                    logger.debug("Could not validate image dimensions for slide %s: %s", slide.id, img_exc)
                
                logger.info(
                    "Successfully captured slide %s: %dx%d (requested: %fx%f)",
                    slide.id,
                    clip_width,
                    clip_height,
                    slide.width,
                    slide.height,
                )
            except Exception as exc:
                raise ExhibitionRendererError(
                    f"Unable to capture screenshot for slide {slide.id}: {exc}"
                ) from exc
            finally:
                # CRITICAL: Close page and context in reverse order
                # This ensures complete cleanup and isolation for the next slide
                with contextlib.suppress(Exception):
                    if page is not None:
                        page.close()
                        logger.debug("Closed page for slide %s", slide.id)
                
                with contextlib.suppress(Exception):
                    if context is not None:
                        context.close()
                        logger.debug("Closed browser context for slide %s", slide.id)
                
                # CRITICAL: Small delay between slides for batch processing
                # With context isolation, we don't need as long a delay, but still helpful
                if slide_count and slide_count > 1 and slide_index < slide_count:
                    import time
                    time.sleep(0.1)  # 100ms is sufficient with context isolation
                    logger.debug("Delayed 100ms after slide %s before processing next", slide.id)

            encoded = base64.b64encode(screenshot_bytes).decode("ascii")
            
            # Use actual captured dimensions for the rendered slide
            # This ensures the metadata matches what was actually captured
            # Note: clip_width and clip_height are the final dimensions used for capture
            rendered_width = int(round(clip_width * ratio))
            rendered_height = int(round(clip_height * ratio))
            
            rendered.append(
                RenderedSlide(
                    id=slide.id,
                    data_url=f"data:image/png;base64,{encoded}",
                    width=rendered_width,
                    height=rendered_height,
                    css_width=float(slide.width),
                    css_height=float(slide.height),
                    pixel_ratio=ratio,
                )
            )
            
            logger.info(
                "Slide %s rendered: %dx%d (captured: %dx%d, ratio: %f)",
                slide.id,
                rendered_width,
                rendered_height,
                capture_width,
                capture_height,
                ratio,
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

