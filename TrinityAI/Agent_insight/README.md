# Workflow Insight Agent

Generates a long-form narrative summarizing an entire Trinity AI workstream. It
collects:

- The user's original intent
- Ordered step outputs/insights from each agent
- File details captured or produced during execution

and feeds them into the same LLM stack used by other agents. The response is a
two-paragraph executive summary that references actual files, metrics, and next
actions.

## Usage

1. Provide `step_records` (one entry per workflow step) including `insight`,
   `result_preview`, and any generated `output_files`.
2. Optionally pass `file_context`, `available_files`, or `generated_files` so the
   agent can enrich the prompt with column statistics via `FileHandler`.
3. Call the `/workflow-insight/generate` endpoint or invoke
   `WorkflowInsightAgent.generate_workflow_insight(...)`.

The agent is reused by both the Stream AI orchestrators and the HTTP endpoint,
ensuring consistent insight language wherever workflows run.

