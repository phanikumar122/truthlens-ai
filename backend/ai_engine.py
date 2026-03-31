import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict

import numpy as np

logger = logging.getLogger(__name__)

# ── Optional heavy imports (graceful fallback) ────────────────────────────────
try:
    import faiss
except ImportError:
    faiss = None
    logger.warning("faiss-cpu not installed — similarity search disabled.")

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    SentenceTransformer = None  # type: ignore
    logger.warning("sentence-transformers not installed — similarity search disabled.")

try:
    from transformers import pipeline as hf_pipeline
except ImportError:
    hf_pipeline = None  # type: ignore
    logger.warning("transformers not installed — using dummy classifier.")

try:
    import spacy
except ImportError:
    spacy = None  # type: ignore
    logger.warning("spacy not installed — NLP preprocessing limited.")


# ── Preprocessor ──────────────────────────────────────────────────────────────
class Preprocessor:
    """Cleans incoming text for the AI pipeline."""

    def __init__(self):
        self.nlp = None
        if spacy is not None:
            try:
                self.nlp = spacy.load("en_core_web_sm")
            except OSError:
                logger.warning("spacy model 'en_core_web_sm' not found — skipping.")

    def clean_text(self, text: str) -> str:
        text = text.lower()
        text = re.sub(r"http\S+", "", text)       # strip URLs
        text = re.sub(r"[^a-zA-Z\s]", "", text)   # strip special chars
        return text.strip()


# ── AI Engine ─────────────────────────────────────────────────────────────────
class AIEngine:
    """Hybrid misinformation detection engine."""

    # Verified fact database used for semantic retrieval
    FACT_DATABASE: list[str] = [
        "The COVID-19 vaccine does not contain microchips.",
        "The Earth is a sphere, not flat.",
        "Drinking bleach is dangerous and does not cure any diseases.",
        "Climate change is primarily driven by human activities.",
        "5G technology does not cause COVID-19 or broadcast pancake recipes.",
        "Vaccines are safe and effective according to peer-reviewed studies.",
        "The moon landing in 1969 was a real event.",
        "Evolution is a well-established scientific theory.",
        "Masks are an effective tool to reduce airborne transmission.",
        "Polio was nearly eradicated globally thanks to vaccines."
    ]

    TRUST_MAP: Dict[str, float] = {
        "bbc": 0.95, "reuters": 0.98, "ap": 0.97, "nytimes": 0.92, 
        "guardian": 0.90, "washingtonpost": 0.91, "npr": 0.94,
        "cnn": 0.85, "fox": 0.60, "teleportdaily": 0.10, "kitchenconfidential": 0.20
    }

    def __init__(self):
        self.preprocessor = Preprocessor()
        self.classifier: Any = None
        self.similarity_model: Any = None
        self.index: Any = None

        # 1. Load HuggingFace classifier
        if hf_pipeline is not None:
            try:
                self.classifier = hf_pipeline(
                    "text-classification",
                    model="roberta-base-openai-detector",
                )
            except Exception as e:
                logger.warning(f"Failed to load classifier model: {e}")

        # 2. Load sentence-transformer + build FAISS index
        if SentenceTransformer is not None and faiss is not None:
            try:
                self.similarity_model = SentenceTransformer("all-MiniLM-L6-v2")
                self._build_faiss_index()
            except Exception as e:
                logger.warning(f"Failed to initialise similarity search: {e}")

    # ── FAISS index ───────────────────────────────────────────────────────
    def _build_faiss_index(self):
        embeddings = self.similarity_model.encode(self.FACT_DATABASE)
        dim = embeddings.shape[1]
        self.index = faiss.IndexFlatL2(dim)
        self.index.add(np.array(embeddings, dtype="float32"))

    # ── Main pipeline ─────────────────────────────────────────────────────
    def process_text(self, text: str, source: str) -> Dict[str, Any]:
        clean = self.preprocessor.clean_text(text)

        # Step 1 — Classification
        label, confidence = self._classify(clean)

        # Step 2 — Semantic similarity
        similarity_score, matching_fact = self._find_similar_fact(clean)

        # Step 3 — Source credibility
        source_score = self._score_source(source)

        # Step 4 — Fused score  (higher → more likely misinformation)
        fake_prob = (
            (confidence if label == "FAKE" else 1 - confidence) * 0.4
            + (1 - similarity_score) * 0.4
            + (1 - source_score) * 0.2
        )
        final_label = (
            "HIGH RISK" if fake_prob > 0.65
            else "MODERATE" if fake_prob > 0.35
            else "LOW RISK"
        )

        return {
            "text": text,
            "label": final_label,
            "confidence": float(round(fake_prob * 100, 2)),
            "explanation": self._explain(final_label, matching_fact, source),
            "source": source,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "virality_score": float(round(np.random.random() * 10, 1)),
        }

    # ── Sub-steps ─────────────────────────────────────────────────────────
    def _classify(self, text: str) -> tuple[str, float]:
        if self.classifier is not None:
            try:
                result = self.classifier(text[:512])[0]
                lbl = "FAKE" if result["label"] == "Fake" else "REAL"
                return lbl, float(result["score"])
            except Exception:
                pass
        # Dummy fallback
        triggers = ["miracle", "cure", "conspiracy", "microchip", "secret", "confirm"]
        if any(w in text for w in triggers):
            return "FAKE", 0.85
        return "REAL", 0.72

    def _find_similar_fact(self, text: str) -> tuple[float, str]:
        if self.similarity_model is None or self.index is None:
            return 0.5, "No direct matches found."
        query = self.similarity_model.encode([text])
        distances, indices = self.index.search(
            np.array(query, dtype="float32"), k=1
        )
        score = float(1.0 / (1.0 + distances[0][0]))
        fact = self.FACT_DATABASE[indices[0][0]] if score > 0.3 else "No direct matches found."
        return score, fact

    def _score_source(self, source: str) -> float:
        s_lower = source.lower()
        for s, score in self.TRUST_MAP.items():
            if s in s_lower:
                return score
        return 0.5 # Unknown sources get neutral score

    @staticmethod
    def _explain(label: str, fact: str, source: str) -> str:
        if label == "HIGH RISK":
            return (
                f"This claim contradicts verified data: '{fact}'. "
                f"The source '{source}' has low reliability for this topic."
            )
        if label == "MODERATE":
            return (
                f"The claim appears biased or unsubstantiated. "
                f"Fact-checkers suggest: '{fact}'."
            )
        return "This information aligns with established facts or comes from a reputable source."
