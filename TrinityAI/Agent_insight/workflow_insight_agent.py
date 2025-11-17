"""
Workflow Insight Agent
======================

Combines user prompts, per-step agent messages, and file details to create a
long-form narrative insight summarizing the entire workstream.
"""

from __future__ import annotations

import json
import logging
import os
import textwrap
import threading
from typing import Any, Dict, List, Optional

from File_handler.available_minio_files import get_file_handler

logger = logging.getLogger("trinity.ai.workflow_insight")


def get_llm_config() -> Dict[str, str]:
    """Return LLM configuration using the same pattern as other agents."""
    ollama_ip = os.getenv("OLLAMA_IP", os.getenv("HOST_IP", "127.0.0.1"))
    llm_port = os.getenv("OLLAMA_PORT", "11434")
    api_url = os.getenv("LLM_API_URL", f"http://{ollama_ip}:{llm_port}/api/chat")
    return {
        "api_url": api_url,
        "model_name": os.getenv("LLM_MODEL_NAME", "deepseek-r1:32b"),
        "bearer_token": os.getenv("LLM_BEARER_TOKEN", "aakash_api_key"),
    }


class WorkflowInsightAgent:
    """
    Generates cohesive workflow-level insights by combining:
    - Original user intent
    - Individual agent outputs / insights
    - File metadata captured during the run
    """

    def __init__(self, api_url: str, model_name: str, bearer_token: str):
        self.api_url = api_url
        self.model_name = model_name
        self.bearer_token = bearer_token
        self._file_handler = None
        self._file_handler_lock = threading.Lock()

    def generate_workflow_insight(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Core entry point used by orchestrators and API endpoint.

        Args:
            payload: Dict containing user_prompt, step_records, file_context, etc.

        Returns:
            Dict with success flag, generated insight, and metadata
        """
        try:
            user_prompt = (payload.get("user_prompt") or "").strip()
            step_records = self._normalize_step_records(payload.get("step_records") or [])
            if not step_records:
                return {
                    "success": False,
                    "insight": "",
                    "error": "No step records supplied for workflow insight generation.",
                }

            file_context = payload.get("file_context")
            files_to_profile = payload.get("generated_files") or []
            available_files = payload.get("available_files") or []
            client_name = payload.get("client_name", "")
            app_name = payload.get("app_name", "")
            project_name = payload.get("project_name", "")

            file_context_block = self._prepare_file_context_block(
                file_context=file_context,
                generated_files=files_to_profile,
                available_files=available_files,
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
            )

            step_section = self._build_step_section(step_records)
            prompt = self._build_prompt(
                user_prompt=user_prompt,
                step_section=step_section,
                file_context_block=file_context_block,
                additional_context=payload.get("additional_context", ""),
                workflow_meta={
                    "session_id": payload.get("session_id"),
                    "workflow_id": payload.get("workflow_id"),
                    "total_steps": payload.get("metadata", {}).get("total_steps", len(step_records)),
                },
            )

            ai_response = self._call_llm(prompt)
            if not ai_response:
                fallback_text = self._fallback_summary(step_records, file_context_block)
                return {
                    "success": False,
                    "insight": fallback_text,
                    "error": "LLM did not return a response. Provided fallback summary.",
                }

            return {
                "success": True,
                "insight": ai_response.strip(),
                "used_steps": len(step_records),
                "files_profiled": len(files_to_profile),
            }

        except Exception as exc:  # pragma: no cover - defensive logging
            logger.error("Workflow insight generation failed: %s", exc, exc_info=True)
            return {
                "success": False,
                "insight": "",
                "error": str(exc),
            }

    def _normalize_step_records(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        normalized: List[Dict[str, Any]] = []
        for idx, record in enumerate(records, start=1):
            step_number = record.get("step_number") or record.get("step") or idx
            agent = record.get("agent") or record.get("atom_id") or "unknown"
            description = (record.get("description") or record.get("title") or "").strip()
            insight = (record.get("insight") or record.get("summary") or "").strip()
            result_preview = self._coerce_to_text(record.get("result_preview"))
            if not result_preview and record.get("raw_result"):
                result_preview = self._coerce_to_text(record["raw_result"])
            outputs = record.get("output_files") or record.get("outputs") or []

            normalized.append(
                {
                    "step_number": step_number,
                    "agent": agent,
                    "description": self._truncate(description, 260),
                    "insight": self._truncate(insight, 480),
                    "result_preview": self._truncate(result_preview, 600),
                    "outputs": outputs[:5] if isinstance(outputs, list) else [],
                }
            )
        return normalized

    def _coerce_to_text(self, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        try:
            return json.dumps(value, default=str)
        except (TypeError, ValueError):
            return str(value)

    def _truncate(self, text: Optional[str], limit: int) -> str:
        if not text:
            return ""
        text = text.strip()
        if len(text) <= limit:
            return text
        return text[: limit - 3] + "..."

    def _prepare_file_context_block(
        self,
        file_context: Optional[Dict[str, Any]],
        generated_files: List[str],
        available_files: List[str],
        client_name: str,
        app_name: str,
        project_name: str,
    ) -> str:
        handler = None
        try:
            handler = self._ensure_file_handler()
            if handler and any([client_name, app_name, project_name]):
                handler.set_context(client_name=client_name, app_name=app_name, project_name=project_name)
        except Exception as exc:
            logger.warning("⚠️ FileHandler unavailable for workflow insight: %s", exc)

        if file_context and handler:
            try:
                return handler.format_file_context_for_llm(file_context)
            except Exception as exc:
                logger.warning("⚠️ Failed to format provided file context: %s", exc)

        files_to_profile = list(dict.fromkeys(generated_files or available_files))[:4]
        if not files_to_profile or not handler:
            return ""

        collected: Dict[str, Any] = {}
        for path in files_to_profile:
            if not path:
                continue
            try:
                details = handler.load_file_details_from_backend(path)
                if details:
                    key = details.get("file_name") or os.path.basename(path) or path
                    collected[key] = details
            except Exception as exc:
                logger.debug("Could not load file details for %s: %s", path, exc)

        if not collected:
            return ""

        try:
            return handler.format_file_context_for_llm(collected)
        except Exception:
            # As a fallback, build a simple block
            lines = ["--- FILES TOUTED BY WORKFLOW ---"]
            for key in collected.keys():
                lines.append(f"- {key}")
            return "\n".join(lines)

    def _build_step_section(self, records: List[Dict[str, Any]]) -> str:
        lines: List[str] = []
        for record in records:
            summary = record["description"] or record["insight"] or "completed the assigned objective"
            lines.append(f"- {record['agent']} focused on {summary}")
            if record["insight"]:
                lines.append(f"  Key takeaway: {record['insight']}")
            elif record["result_preview"]:
                lines.append(f"  Observable outcome: {record['result_preview']}")
            if record["outputs"]:
                outputs = ", ".join(record["outputs"])
                lines.append(f"  Outputs referenced: {outputs}")
        if len(lines) > 200:
            lines = lines[:200]
            lines.append("   … truncated additional steps …")
        return "\n".join(lines)

    def _build_prompt(
        self,
        user_prompt: str,
        step_section: str,
        file_context_block: str,
        additional_context: str,
        workflow_meta: Dict[str, Any],
    ) -> str:
        instructions = textwrap.dedent(
            """
            Your task is to answer the user’s question using only the evidence contained
            in the sections above (Step Evidence, File Context, Additional Notes).

            Style rules:
            - Think like a senior analyst: synthesize meaning, do not just restate outputs.
            - Tie every point back to the user’s intent and the specific datasets or files referenced.
            - Keep the tone confident, human, and insight-oriented; avoid meta language about agents, prompts, or pipelines.
            - When data is missing, call it out explicitly rather than guessing.

            Output format (use these headings, each on its own line):
            1. Summary — 2–3 sentences in plain language explaining what the workflow revealed and why it matters.
            2. Key insights — a short bulleted list highlighting the non-obvious observations a human expert would surface.
            3. Patterns / Red flags / Opportunities — note directional signals, anomalies, or leverage points; separate items with semicolons if needed.
            4. Missing information or assumptions — clarify any data gaps or leaps of logic that limit confidence.
            5. Recommendations or next steps — actionable guidance connected to the findings, framed as strategic advice.

            Hard constraints:
            - Do not fabricate metrics or files; only cite evidence provided.
            - Never describe the internal workflow mechanics (no mentions of steps, pipelines, or agents).
            - Keep the entire response concise but substantive, focusing on reasoning and implications.
            """
        ).strip()

        meta_lines = []
        if workflow_meta.get("workflow_id"):
            meta_lines.append(f"Workflow ID: {workflow_meta['workflow_id']}")
        if workflow_meta.get("session_id"):
            meta_lines.append(f"Session: {workflow_meta['session_id']}")
        if workflow_meta.get("total_steps"):
            meta_lines.append(f"Total Steps: {workflow_meta['total_steps']}")

        meta_section = "\n".join(meta_lines)

        sections = [
            "USER INTENT:\n" + (user_prompt or "N/A"),
            "WORKFLOW META:\n" + (meta_section or "Not provided"),
            "STEP DIGEST (ordered):\n" + step_section,
        ]

        if file_context_block:
            sections.append("FILE CONTEXT:\n" + file_context_block.strip())

        if additional_context:
            sections.append("ADDITIONAL NOTES:\n" + additional_context.strip())

        sections.append("INSTRUCTIONS:\n" + instructions)

        return "\n\n".join(sections)

    def _call_llm(self, prompt: str) -> Optional[str]:
        if not prompt.strip():
            return None
        try:
            import requests  # type: ignore
        except ImportError:  # pragma: no cover - lint fallback
            logger.error("Requests library is not available; cannot call LLM endpoint.")
            return None

        headers = {"Content-Type": "application/json"}
        if self.bearer_token:
            headers["Authorization"] = f"Bearer {self.bearer_token}"

        payload = {
            "model": self.model_name,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are the Trinity Workflow Insight narrator. "
                        "Deliver polished multi-sentence narratives grounded strictly in supplied data."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "stream": False,
            "temperature": 0.3,
            "max_tokens": 700,
        }

        response = requests.post(self.api_url, headers=headers, json=payload, timeout=60)
        if response.status_code != 200:
            logger.error("Workflow insight LLM error: %s - %s", response.status_code, response.text)
            return None

        data = response.json()
        if "message" in data and data["message"].get("content"):
            return data["message"]["content"]
        choices = data.get("choices")
        if choices:
            return choices[0].get("message", {}).get("content")
        return None

    def _fallback_summary(self, records: List[Dict[str, Any]], file_context_block: str) -> str:
        lines = ["Workflow summary (fallback mode):"]
        for record in records:
            snippet = record["insight"] or record["description"] or f"Completed {record['agent']}"
            lines.append(f"{record['step_number']}. {snippet}")
        if file_context_block:
            lines.append("\nFiles referenced:\n" + file_context_block[:500])
        return "\n".join(lines)

    def _ensure_file_handler(self):
        if self._file_handler is not None:
            return self._file_handler

        with self._file_handler_lock:
            if self._file_handler is not None:
                return self._file_handler

            minio_endpoint = os.getenv("MINIO_ENDPOINT", "minio:9000")
            minio_access_key = os.getenv("MINIO_ACCESS_KEY", "minio")
            minio_secret_key = os.getenv("MINIO_SECRET_KEY", "minio123")
            minio_bucket = os.getenv("MINIO_BUCKET", "trinity")
            minio_prefix = os.getenv("MINIO_PREFIX", os.getenv("MINIO_OBJECT_PREFIX", ""))

            self._file_handler = get_file_handler(
                minio_endpoint=minio_endpoint,
                minio_access_key=minio_access_key,
                minio_secret_key=minio_secret_key,
                minio_bucket=minio_bucket,
                object_prefix=minio_prefix,
            )
        return self._file_handler


_workflow_insight_agent: Optional[WorkflowInsightAgent] = None
_workflow_agent_lock = threading.Lock()


def get_workflow_insight_agent() -> WorkflowInsightAgent:
    """Singleton accessor used by orchestrators and routers."""
    global _workflow_insight_agent
    if _workflow_insight_agent is not None:
        return _workflow_insight_agent

    with _workflow_agent_lock:
        if _workflow_insight_agent is None:
            cfg = get_llm_config()
            _workflow_insight_agent = WorkflowInsightAgent(
                api_url=cfg["api_url"],
                model_name=cfg["model_name"],
                bearer_token=cfg["bearer_token"],
            )
            logger.info("✅ WorkflowInsightAgent initialized")
    return _workflow_insight_agent

