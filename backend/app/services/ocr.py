"""Reads short scanned filings, such as signed letters to the exchange, by optical character recognition.

Only short documents are read this way. A scanned annual report would take many minutes of CPU,
so those are still reported as unreadable.
"""
import logging
from typing import Optional

logger = logging.getLogger("finn.ocr")

MAX_OCR_PAGES = 12  # Dense pages take several seconds each, so this keeps a filing under about a minute.
RENDER_SCALE = 1.5  # About 108 dpi: sharp enough for printed figures, and far quicker than full resolution.
MIN_CONFIDENCE = 0.5

_engine = None


def available() -> bool:
    try:
        import pypdfium2  # noqa: F401
        import rapidocr_onnxruntime  # noqa: F401
    except ImportError:
        return False
    return True


def _get_engine():
    global _engine
    if _engine is None:
        from rapidocr_onnxruntime import RapidOCR

        _engine = RapidOCR()
    return _engine


def lines_from_boxes(result: Optional[list]) -> str:
    """Rebuilds lines from the engine's word boxes, so a table row reads left to right as it's printed."""
    if not result:
        return ""
    boxes = []
    for box, text, score in result:
        if float(score) < MIN_CONFIDENCE or not str(text).strip():
            continue
        ys = [point[1] for point in box]
        xs = [point[0] for point in box]
        boxes.append({"top": min(ys), "bottom": max(ys), "left": min(xs), "text": str(text).strip()})
    boxes.sort(key=lambda b: (b["top"], b["left"]))

    lines: list[list[dict]] = []
    for item in boxes:
        middle = (item["top"] + item["bottom"]) / 2
        if lines:
            last = lines[-1]
            top = min(b["top"] for b in last)
            bottom = max(b["bottom"] for b in last)
            if top <= middle <= bottom:
                last.append(item)
                continue
        lines.append([item])
    return "\n".join(" ".join(b["text"] for b in sorted(line, key=lambda b: b["left"])) for line in lines)


def read_scanned_pdf(data: bytes, max_pages: int = MAX_OCR_PAGES) -> list[str]:
    """The text of each page, by OCR. Raises ImportError when the OCR packages aren't installed."""
    import numpy as np
    import pypdfium2 as pdfium

    engine = _get_engine()
    document = pdfium.PdfDocument(data)
    pages = []
    try:
        for index in range(min(len(document), max_pages)):
            image = document[index].render(scale=RENDER_SCALE).to_pil().convert("RGB")
            result, _ = engine(np.array(image)[:, :, ::-1])  # The engine expects OpenCV's BGR order.
            pages.append(lines_from_boxes(result))
    finally:
        document.close()
    return pages
