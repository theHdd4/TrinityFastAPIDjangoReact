from __future__ import annotations

import asyncio
import contextlib
import copy
import hashlib
import difflib
import json
import logging
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from ..common import aiohttp, generate_insights, logger, memory_storage_module, summarize_chat_messages, WebSocketDisconnect
from ..constants import DATASET_OUTPUT_ATOMS, PREFERS_LATEST_DATASET_ATOMS
from ..types import ReActState, RetryableJSONGenerationError, StepEvaluation, WebSocketEvent, WorkflowPlan, WorkflowStepPlan
from STREAMAI.lab_context_builder import LabContextBuilder
from STREAMAI.lab_memory_models import LaboratoryEnvelope, WorkflowStepRecord
from STREAMAI.lab_memory_store import LabMemoryStore
from ...atom_mapping import ATOM_MAPPING
from ...graphrag import GraphRAGWorkspaceConfig
from ...graphrag.client import GraphRAGQueryClient
from ...graphrag.prompt_builder import GraphRAGPromptBuilder, PhaseOnePrompt as GraphRAGPhaseOnePrompt
from STREAMAI.laboratory_retriever import LaboratoryRetrievalPipeline
from STREAMAI.stream_rag_engine import StreamRAGEngine
from STREAMAI.intent_service import IntentService
from STREAMAI.result_extractor import ResultExtractor



class WorkflowReactPromptsMixin:
    """Planning helper mixin extracted from WorkflowPlanningMixin."""
    def _build_react_planning_prompt(
            self,
            user_prompt: str,
            execution_history: List[Dict[str, Any]],
            available_files: List[str],
            previous_results: List[Dict[str, Any]],
            prompt_files: List[str],
            files_exist: bool
        ) -> str:
            """
            Build ReAct-style planning prompt for next step generation.

            Uses Thought-Action pattern.
            """
            lines: List[str] = []

            # Detect if user is asking for something new
            user_request_keywords = ["chart", "graph", "visualize", "plot", "redo", "redo it", "modify", "change", 
                                     "create", "generate", "make", "show", "display", "analyze", "do", "now", 
                                     "also", "and", "then", "next", "please", "can you", "i want", "i need"]
            user_asking_for_something = any(keyword.lower() in user_prompt.lower() for keyword in user_request_keywords)

            lines.append("You are a ReAct-style agent planning the next step in a data workflow.")
            lines.append("")
            lines.append("## ⚠️ CRITICAL: ALWAYS HONOR USER REQUESTS")
            lines.append("**MOST IMPORTANT RULE**: If the user asks for something, you MUST do it. Never refuse, never say 'no need', never ignore user requests.")
            lines.append("- If user asks for 'chart' → Generate a chart (even if one exists, user may want different type)")
            lines.append("- If user asks for 'redo' → Redo the operation")
            lines.append("- If user asks for 'modify' → Modify as requested")
            lines.append("- If user asks for ANY operation → Execute it with goal_achieved: false")
            lines.append("- Only set goal_achieved: true if user's request is COMPLETELY done AND user is NOT asking for more")
            lines.append("")
            lines.append("## USER REQUEST")
            lines.append(user_prompt)
            lines.append("")

            if user_asking_for_something:
                lines.append("**⚠️ USER IS ASKING FOR SOMETHING - YOU MUST EXECUTE IT:**")
                lines.append("- The user request contains keywords indicating they want an operation performed")
                lines.append("- You MUST set goal_achieved: false and plan the requested step")
                lines.append("- Do NOT refuse or say the work is already done")
                lines.append("- Do NOT set goal_achieved: true when user is asking for something")
                lines.append("")
            else:
                lines.append("**Analyze the user request above:**")
                lines.append("- Is the user asking for something specific? (chart, redo, modify, analyze, etc.)")
                lines.append("- If YES: You MUST execute it. Set goal_achieved: false and plan the step.")
                lines.append("- If user is asking for something NEW, the goal is NOT achieved yet.")
                lines.append("")

            if execution_history:
                # Check if chart-maker has been used
                chart_maker_used = any(h.get("atom_id") == "chart-maker" for h in execution_history)

                lines.append("## EXECUTION HISTORY (ALREADY COMPLETED - DO NOT REPEAT)")
                lines.append("⚠️ CRITICAL: These steps have ALREADY been executed. DO NOT repeat them!")
                lines.append("")

                # Add warning if chart-maker hasn't been used
                if not chart_maker_used:
                    lines.append("⚠️ **CHART-MAKER NOT YET USED**: Chart-maker has NOT been executed yet.")
                    lines.append("   - You MUST plan to use chart-maker before setting goal_achieved: true")
                    lines.append("   - Chart-maker should visualize the final results from the most recent step")
                    lines.append("   - Use the most recent output file (marked with 📄 below) for the chart")
                    lines.append("")
                for idx, hist in enumerate(execution_history, 1):
                    step_num = hist.get("step_number", "?")
                    atom_id = hist.get("atom_id", "?")
                    description = hist.get("description", "N/A")
                    files_used = hist.get("files_used", [])
                    result = hist.get("result", {})
                    success = result.get("success", True)
                    evaluation = hist.get("evaluation", {})
                    decision = evaluation.get("decision", "continue") if evaluation else "continue"

                    lines.append(f"**Step {step_num}: {atom_id}** - {'✅ Success' if success else '❌ Failed'}")
                    lines.append(f"  Description: {description}")
                    if files_used:
                        files_display = [self._display_file_name(f) for f in files_used]
                        lines.append(f"  Files used: {', '.join(files_display)}")

                    # Show output file if available
                    saved_path = None
                    if isinstance(result, dict):
                        # Try to extract output file from result
                        if atom_id == "merge" and result.get("merge_json"):
                            saved_path = result.get("merge_json", {}).get("result_file") or result.get("saved_path")
                        elif atom_id == "concat" and result.get("concat_json"):
                            saved_path = result.get("concat_json", {}).get("result_file") or result.get("saved_path")
                        elif atom_id in ["create-column", "create-transform"] and result.get("create_transform_json"):
                            saved_path = result.get("create_transform_json", {}).get("result_file") or result.get("saved_path")
                        elif result.get("output_file"):
                            saved_path = result.get("output_file")
                        elif result.get("saved_path"):
                            saved_path = result.get("saved_path")

                    if saved_path:
                        file_display = self._display_file_name(saved_path)
                        lines.append(f"  📄 **OUTPUT FILE CREATED: {file_display} ({saved_path})**")
                        lines.append(f"     ⚠️ **YOU MUST USE THIS FILE in the next step - DO NOT repeat {atom_id}**")

                    if not success:
                        error = result.get("error") or result.get("message", "Unknown error")
                        lines.append(f"  ❌ Error: {error}")
                    elif decision == "complete":
                        lines.append(f"  ✅ Goal achieved - workflow should be complete")

                    lines.append("")  # Blank line between steps

                lines.append("⚠️ **CRITICAL REMINDERS:**")
                lines.append("1. DO NOT repeat any of the above steps with the same atom_id")
                lines.append("2. DO NOT use the same files that were already processed")
                lines.append("3. USE the output files created by previous steps (marked with 📄)")
                lines.append("4. If a step created a file, that file is now available in AVAILABLE FILES section above")
                lines.append("5. If all required operations are done, set goal_achieved: true")
                lines.append("")
            else:
                lines.append("## EXECUTION HISTORY")
                lines.append("No previous steps executed yet.")
                lines.append("")

            lines.append("## AVAILABLE FILES")
            lines.append("These files are available for use. Files created by previous steps are marked with ⭐")
            if available_files:
                # Get file metadata to show column names
                file_metadata = self._get_file_metadata(available_files)

                # Show recently created files first (last in list are newest)
                recent_files = available_files[-10:] if len(available_files) > 10 else available_files
                older_files = available_files[:-10] if len(available_files) > 10 else []

                if recent_files:
                    lines.append("")
                    lines.append("⭐ RECENTLY CREATED FILES (from previous steps - USE THESE FIRST):")
                    for f in recent_files:
                        file_display = self._display_file_name(f)
                        lines.append(f"  ⭐ {file_display} ({f})")
                        # Show column names if available
                        if f in file_metadata:
                            columns = file_metadata[f].get("columns", [])
                            if columns:
                                lines.append(f"     Columns: {', '.join(columns[:10])}")
                                if len(columns) > 10:
                                    lines.append(f"     ... and {len(columns) - 10} more columns")

                if older_files:
                    lines.append("")
                    lines.append("Other available files:")
                    for f in older_files[:15]:  # Limit older files
                        file_display = self._display_file_name(f)
                        lines.append(f"  - {file_display} ({f})")
                        # Show column names if available
                        if f in file_metadata:
                            columns = file_metadata[f].get("columns", [])
                            if columns:
                                lines.append(f"    Columns: {', '.join(columns[:8])}")
                                if len(columns) > 8:
                                    lines.append(f"    ... and {len(columns) - 8} more")
                    if len(older_files) > 15:
                        lines.append(f"  ... and {len(older_files) - 15} more files")
            else:
                lines.append("No files available")
            lines.append("")
            lines.append("⚠️ CRITICAL FILE USAGE RULES:")
            lines.append("1. If a previous step created a file, you MUST use that file in the next step")
            lines.append("2. Do NOT repeat the same operation that created the file")
            lines.append("3. Use ONLY the column names shown above - do NOT invent or guess column names")
            lines.append("4. Files marked with ⭐ are the most recent outputs - prefer these for next steps")
            lines.append("")

            if prompt_files:
                lines.append("## PRIORITY FILES (mentioned in user request)")
                for f in prompt_files:
                    lines.append(f"- {f}")
                lines.append("")

            lines.append("## AVAILABLE TOOLS (atoms)")
            atom_capabilities = self._get_atom_capabilities_for_llm()
            lines.append(atom_capabilities)
            lines.append("")

            lines.append("## YOUR TASK")
            lines.append("Analyze the current state and plan the NEXT SINGLE STEP.")
            lines.append("")
            lines.append("Follow this structure:")
            lines.append("")
            lines.append("**THOUGHT (REQUIRED - Be detailed and explicit):**")
            lines.append("1. **Review EXECUTION HISTORY**: What steps have been completed? What files were created?")
            lines.append("2. **Review USER REQUEST**: What did the user ask for? What still needs to be done?")
            lines.append("3. **Review AVAILABLE FILES**: Which files are available? Which is the most recent output?")
            lines.append("4. **Review DATAFRAME SCHEMA**: What columns exist in the current DataFrame? (Check FILE METADATA above)")
            lines.append("5. **Determine NEXT ACTION**: What specific operation needs to be done next?")
            lines.append("6. **Check CHART REQUIREMENT**: Has chart-maker been used? If not, plan to use it (usually at the end)")
            lines.append("7. **Select APPROPRIATE TOOL**: Which atom_id matches the next action?")
            lines.append("8. **Verify FILE SELECTION**: Which file(s) should be used? Use the most recent output file if available.")
            lines.append("")
            lines.append("**ACTION (REQUIRED - Be specific):**")
            lines.append("- Select the next tool (atom_id) - must match one of the available atoms")
            lines.append("- Generate CLEAR step description that explains what this step will do")
            lines.append("- Specify EXACT files to use (use file paths from AVAILABLE FILES section)")
            lines.append("- Provide descriptive output alias for the result")
            lines.append("")
            lines.append("Respond with JSON in this format:")
            lines.append("{")
            lines.append('  "thought": "Your reasoning about what to do next",')
            lines.append('  "atom_id": "merge|concat|chart-maker|groupby-wtg-avg|...",')
            lines.append('  "description": "Clear description of this step",')
            lines.append('  "files_used": ["file1.arrow", "file2.arrow"],')
            lines.append('  "inputs": ["input1", "input2"],')
            lines.append('  "output_alias": "descriptive_output_name",')
            lines.append('  "goal_achieved": false')
            lines.append("}")
            lines.append("")
            lines.append("## CRITICAL RULES (MUST FOLLOW):")
            lines.append("1. ⚠️ **ALWAYS LISTEN TO THE USER** - If the user asks for something, you MUST do it. Never refuse or say 'no need'")
            lines.append("2. ⚠️ **DO NOT repeat any step** that has already been executed (check EXECUTION HISTORY above)")
            lines.append("3. ⚠️ **If a previous step created a file, USE THAT FILE** in the next step - do NOT recreate it")
            lines.append("4. ⚠️ **Only set goal_achieved: true if the user's request is COMPLETELY done AND user is not asking for more**")
            lines.append("5. ⚠️ **If user asks for something NEW (chart, redo, modify, etc.), set goal_achieved: false** and continue")
            lines.append("6. ⚠️ **Only plan ONE step at a time** - do not plan multiple steps")
            lines.append("7. ⚠️ **Choose a DIFFERENT tool/operation** than what was already done (unless user explicitly asks to redo)")
            lines.append("8. ⚠️ **Use files marked with ⭐** (recently created) when possible")
            lines.append("9. ⚠️ **Use ONLY column names** shown in FILE METADATA above - do NOT invent column names")
            lines.append("10. ⚠️ **User requests take priority** - If user asks for chart, redo, or any operation, you MUST execute it")
            lines.append("")
            lines.append("## ⚠️ CRITICAL: CHART-MAKER MUST ALWAYS BE INCLUDED")
            lines.append("**MANDATORY RULE**: Chart-maker MUST be used in EVERY workflow:")
            lines.append("1. **If chart-maker has NOT been used yet**: You MUST plan to use it (usually as the last step)")
            lines.append("2. **If data transformations are done**: Use chart-maker to visualize the results")
            lines.append("3. **If user's main request is complete**: Add chart-maker to show the final results visually")
            lines.append("4. **ONLY set goal_achieved: true AFTER chart-maker has been executed** (unless user explicitly doesn't want visualization)")
            lines.append("")
            lines.append("**When planning chart-maker:**")
            lines.append("- **Check EXECUTION HISTORY** for output files created by previous steps (marked with 📄)")
            lines.append("- **USE THE MOST RECENT OUTPUT FILE** from previous steps (usually the last file in AVAILABLE FILES marked with ⭐)")
            lines.append("- **Do NOT use original input files** if a processed/transformed file exists from previous steps")
            lines.append("- **Example**: If Step 1: merge created merged_data.arrow → Step 2: groupby created grouped_data.arrow → Use grouped_data.arrow for chart, NOT the original files")
            lines.append("- **The chart should visualize the RESULT of previous transformations**, not the raw input data")
            lines.append("")
            lines.append("## LOOP PREVENTION (CRITICAL):")
            lines.append("Before planning your step, check:")
            lines.append("")
            lines.append("1. **Check EXECUTION HISTORY**: Has the atom_id you're planning already been used?")
            lines.append("   - If YES: You MUST use a DIFFERENT atom_id OR use a DIFFERENT file")
            lines.append("   - Example: If Step 1 used 'groupby-wtg-avg' on file A, do NOT use 'groupby-wtg-avg' on file A again")
            lines.append("")
            lines.append("2. **Check FILES USED**: Are you planning to use the same files as a previous step?")
            lines.append("   - If YES and same atom_id: This is a LOOP - choose a different atom_id or different files")
            lines.append("   - Example: If Step 1 used 'merge' on files [A, B], do NOT use 'merge' on [A, B] again")
            lines.append("")
            lines.append("3. **Check OUTPUT FILES**: Did a previous step create a file you should use?")
            lines.append("   - If YES: Use that output file instead of repeating the operation")
            lines.append("   - Example: If Step 1 created 'merged_data.arrow', use 'merged_data.arrow' in Step 2, not the original files")
            lines.append("")
            lines.append("4. **Check GOAL STATUS**: Is the user's request fully satisfied?")
            lines.append("   - **CRITICAL**: Only set goal_achieved: true if:")
            lines.append("     * The user is NOT asking for anything more")
            lines.append("     * ALL required operations are complete")
            lines.append("     * **Chart-maker has been executed** (visualization is shown)")
            lines.append("   - If chart-maker has NOT been used yet, set goal_achieved: false and plan chart-maker as next step")
            lines.append("   - If user asks for 'chart', 'redo', 'modify', or any new operation, set goal_achieved: false and continue")
            lines.append("   - Example: If user asked for 'merge and chart', and merge is done but chart-maker not used, set goal_achieved: false and plan chart-maker")
            lines.append("   - Example: If user asked for 'merge and chart', both are done, and user says 'thanks' or nothing, then set goal_achieved: true")
            lines.append("   - **ALWAYS honor user requests** - Never refuse or say 'no need to do'")
            lines.append("")
            lines.append("**ANTI-LOOP EXAMPLES:**")
            lines.append("- ❌ BAD: Step 1: groupby on file A → Step 2: groupby on file A (SAME operation, SAME file)")
            lines.append("- ✅ GOOD: Step 1: groupby on file A → Step 2: chart-maker on output_file (DIFFERENT operation, uses output)")
            lines.append("- ❌ BAD: Step 1: merge files [A, B] → Step 2: merge files [A, B] (REPEATED)")
            lines.append("- ✅ GOOD: Step 1: merge files [A, B] → Step 2: groupby on merged_output (USES OUTPUT)")
            lines.append("")
            lines.append("## 📚 DETAILED WORKFLOW EXAMPLES (Learn from these):")
            lines.append("")
            lines.append("### Example 1: Compute Annual Sales of Product/Brand/SKU Over Years Across Markets")
            lines.append("")
            lines.append("**User Request**: 'How to compute annual sales of a particular product or SKU or brand over the last few years across markets or regions?'")
            lines.append("")
            lines.append("**Step-by-Step Workflow:**")
            lines.append("1. **Check Date/Year Column**: Check if 'Year' column exists. If not, check if 'date' column exists.")
            lines.append("2. **Handle Date DataType** (if needed): If 'date' exists but is in object form:")
            lines.append("   - Use data-upload-validate atom to load the file")
            lines.append("   - Change datatype of 'date' column to 'datetime' using dtype_changes")
            lines.append("   - Save the dataframe")
            lines.append("3. **Create Year Column** (if needed):")
            lines.append("   - Use dataframe-operations atom")
            lines.append("   - Create a new column called 'Year' using the formula 'Year' (extracts year from date column)")
            lines.append("   - Save the dataframe")
            lines.append("4. **Group and Aggregate Sales**:")
            lines.append("   - Use groupby-wtg-avg atom")
            lines.append("   - Group by: product/brand/SKU, market/region, Year")
            lines.append("   - For volume and value sales: aggregate using 'sum'")
            lines.append("   - For price and distribution: aggregate using 'weighted_avg' (weighted mean of volume)")
            lines.append("   - Save this new dataframe")
            lines.append("5. **Visualize Results**:")
            lines.append("   - Use chart-maker atom")
            lines.append("   - Chart type: bar chart")
            lines.append("   - X-axis: 'Year'")
            lines.append("   - Y-axis: 'Annual sales' (or aggregated sales column)")
            lines.append("   - Use the output file from step 4")
            lines.append("")
            lines.append("### Example 2: Compute Market Share of Products Across Markets for Specific Time")
            lines.append("")
            lines.append("**User Request**: 'How will you compute market share of different products across markets for a specific time?'")
            lines.append("")
            lines.append("**Step-by-Step Workflow:**")
            lines.append("1. **Check Date/Year Column**: Check if 'Year' column exists. If not, check if 'date' column exists.")
            lines.append("2. **Handle Date DataType** (if needed): If 'date' exists but is in object form:")
            lines.append("   - Use data-upload-validate atom to load the file")
            lines.append("   - Change datatype of 'date' column to 'datetime' using dtype_changes")
            lines.append("   - Save the dataframe")
            lines.append("3. **Create Time Period Column**:")
            lines.append("   - Use dataframe-operations atom")
            lines.append("   - Create a new column for the specific time period (Year, Month, or Quarter)")
            lines.append("   - Use formula 'Year', 'Month', or 'Quarter' as appropriate")
            lines.append("   - Save the dataframe")
            lines.append("4. **Check for Market Share Column**:")
            lines.append("   - If 'Market Share' column already exists:")
            lines.append("     → Go to Step 5 (Visualize)")
            lines.append("   - If 'Market Share' column does NOT exist:")
            lines.append("     → Continue to Step 4a")
            lines.append("4a. **Calculate Category Sales**:")
            lines.append("   - Use groupby-wtg-avg atom")
            lines.append("   - Group by: market, date (or time period column)")
            lines.append("   - For volume and value sales: aggregate using 'sum'")
            lines.append("   - For price and distribution: aggregate using 'weighted_avg'")
            lines.append("   - Rename aggregated column to 'Category Sales'")
            lines.append("   - Save this dataframe as 'Category Sales'")
            lines.append("4b. **Merge with Original Data**:")
            lines.append("   - Use merge atom")
            lines.append("   - Left join: original dataframe with 'Category Sales' dataframe")
            lines.append("   - Join on: 'Market' and 'date' (or time period column)")
            lines.append("   - Save merged dataframe as 'Merged_Brand_Cat'")
            lines.append("4c. **Calculate Market Share**:")
            lines.append("   - Use dataframe-operations atom")
            lines.append("   - Select 'Merged_Brand_Cat' file")
            lines.append("   - Create new column called 'Market Share'")
            lines.append("   - Formula: Sales value / Category Sales (DIV operation)")
            lines.append("   - Save the dataframe")
            lines.append("5. **Visualize Market Share**:")
            lines.append("   - Use chart-maker atom")
            lines.append("   - Chart type: pie chart")
            lines.append("   - X-axis: 'brand' or 'product'")
            lines.append("   - Y-axis: 'Market Share'")
            lines.append("   - Filters: Add 'market' and time period as filters")
            lines.append("   - Use the output file from step 4c (or step 3 if market share already existed)")
            lines.append("")
            lines.append("**Key Learnings from Examples:**")
            lines.append("- Always check for required columns (Year, date, Market Share) before using them")
            lines.append("- Handle data types properly (object → datetime conversion)")
            lines.append("- Create derived columns when needed (Year, Market Share)")
            lines.append("- Use groupby for aggregations (sum for sales, weighted_avg for price/distribution)")
            lines.append("- Use merge to combine dataframes when calculating ratios (market share = brand sales / category sales)")
            lines.append("- Always end with chart-maker to visualize results")
            lines.append("- Use output files from previous steps, not original files")
            lines.append("")

            return "\n".join(lines)

    def _build_react_evaluation_prompt(
            self,
            execution_result: Dict[str, Any],
            atom_id: str,
            step_number: int,
            user_prompt: str,
            step_plan: WorkflowStepPlan,
            execution_history: List[Dict[str, Any]]
        ) -> str:
            """
            Build ReAct-style evaluation prompt for step result assessment.
            """
            lines: List[str] = []

            # Detect if user is asking for something new
            user_request_keywords = ["chart", "graph", "visualize", "plot", "redo", "redo it", "modify", "change", 
                                     "create", "generate", "make", "show", "display", "analyze", "do", "now", 
                                     "also", "and", "then", "next", "please", "can you", "i want", "i need"]
            user_asking_for_something = any(keyword.lower() in user_prompt.lower() for keyword in user_request_keywords)

            lines.append("You are a ReAct-style agent evaluator. Evaluate the execution result of a workflow step.")
            lines.append("")
            lines.append("## ⚠️ CRITICAL: ALWAYS HONOR USER REQUESTS")
            lines.append("**MOST IMPORTANT RULE**: If the user asks for something, you MUST continue. Never refuse, never say 'no need', never set decision='complete' when user is asking for more.")
            lines.append("")
            lines.append("## USER REQUEST")
            lines.append(user_prompt)
            lines.append("")

            if user_asking_for_something:
                lines.append("**⚠️ USER IS ASKING FOR SOMETHING - YOU MUST CONTINUE:**")
                lines.append("- The user request contains keywords indicating they want an operation performed")
                lines.append("- You MUST set decision='continue' (NOT 'complete')")
                lines.append("- Do NOT refuse or say the work is already done")
                lines.append("- Do NOT set decision='complete' when user is asking for something")
                lines.append("")

            lines.append("## STEP THAT WAS EXECUTED")
            lines.append(f"Step {step_number}: {atom_id}")
            lines.append(f"Description: {step_plan.description}")
            lines.append(f"Files used: {', '.join(step_plan.files_used) if step_plan.files_used else 'None'}")
            lines.append("")

            lines.append("## EXECUTION RESULT")
            # Format result for readability - truncate large results to prevent timeout
            result_str = json.dumps(execution_result, indent=2)
            # Truncate if too long (keep it concise for faster evaluation)
            max_result_length = 1500  # Reduced from 2000 for faster processing
            if len(result_str) > max_result_length:
                result_str = result_str[:max_result_length] + "\n... (truncated - result too large)"
            lines.append(result_str)
            lines.append("")

            # Add summary of result size
            if len(json.dumps(execution_result)) > max_result_length:
                lines.append(f"Note: Full result is {len(json.dumps(execution_result))} chars, showing summary above")
                lines.append("")

            success = bool(execution_result.get("success", True))
            error = execution_result.get("error") or execution_result.get("message", "")

            lines.append("## EXECUTION STATUS")
            lines.append(f"Success: {success}")
            if error and not success:
                lines.append(f"Error: {error}")
            lines.append("")

            if execution_history:
                lines.append("## PREVIOUS STEPS")
                for hist in execution_history[-3:]:  # Last 3 steps
                    step_num = hist.get("step_number", "?")
                    atom_id_hist = hist.get("atom_id", "?")
                    result_hist = hist.get("result", {})
                    success_hist = result_hist.get("success", True)
                    lines.append(f"Step {step_num}: {atom_id_hist} - {'✅' if success_hist else '❌'}")
                lines.append("")

            lines.append("## YOUR TASK")
            lines.append("Evaluate this step execution and decide what to do next.")
            lines.append("")
            lines.append("**EVALUATION CHECKLIST (Be thorough):**")
            lines.append("1. **Correctness**: Was the execution successful? Any errors? Check the execution_result for success status.")
            lines.append("2. **Result Quality**: Does the result meet the user's goal? Is the data correct? Check if output files were created.")
            lines.append("3. **Issues**: Are there any problems or anomalies in the result?")
            lines.append("4. **Chart Requirement**: Has chart-maker been used in this workflow? If NOT, you MUST set decision='continue' to plan chart-maker next.")
            lines.append("5. **Next Action**: What should happen next? If chart-maker not used, plan it. If all done including chart, set decision='complete'.")
            lines.append("")
            lines.append("Respond with JSON in this format:")
            lines.append("{")
            lines.append('  "decision": "continue|retry_with_correction|change_approach|complete",')
            lines.append('  "reasoning": "Your detailed reasoning about the result and decision",')
            lines.append('  "quality_score": 0.85,  // Optional: 0.0 to 1.0')
            lines.append('  "correctness": true,  // Was execution successful?')
            lines.append('  "issues": ["issue1", "issue2"],  // List any problems found')
            lines.append('  "corrected_prompt": "...",  // Only if decision is retry_with_correction')
            lines.append('  "alternative_approach": "..."  // Only if decision is change_approach')
            lines.append("}")
            lines.append("")
            lines.append("DECISION GUIDE:")
            lines.append("- **continue**: Step succeeded and we should proceed to next step")
            lines.append("- **retry_with_correction**: Step failed or has issues, retry with corrected parameters")
            lines.append("- **change_approach**: Current approach won't work, try different tool/strategy")
            lines.append("- **complete**: User's goal is fully achieved, workflow is done")
            lines.append("")
            lines.append("⚠️ CRITICAL: When to set decision='complete':")
            lines.append("- **ONLY** if the user's original request has been fully satisfied AND user is NOT asking for more")
            lines.append("- If all required data transformations are done AND user has not requested additional work")
            lines.append("- If the final output (chart, report, etc.) has been created AND user is satisfied")
            lines.append("- **DO NOT set 'complete' if:**")
            lines.append("  * User asks for a chart (even if one exists, user may want a different type)")
            lines.append("  * User asks to 'redo' or 'modify' something")
            lines.append("  * User asks for additional analysis or operations")
            lines.append("  * User makes ANY new request - always honor it with decision='continue'")
            lines.append("- **ALWAYS LISTEN TO THE USER** - If user asks for something, set decision='continue' and do it")
            lines.append("- DO NOT set 'complete' if more work is clearly needed or if user is asking for something")
            lines.append("")
            lines.append("⚠️ REDUNDANCY CHECK (CRITICAL):")
            lines.append("Before deciding, check if this step is redundant:")
            lines.append("")
            lines.append("1. **Same atom, same files**: If this step used the same atom_id and same files as a previous step:")
            lines.append("   - This is REDUNDANT - set decision='complete' if goal is achieved, or 'change_approach' if not")
            lines.append("   - Example: Step 1 used 'groupby' on file A → Step 2 used 'groupby' on file A = REDUNDANT")
            lines.append("")
            lines.append("2. **Same operation, different files**: If this step did the same operation but on different files:")
            lines.append("   - This might be intentional (e.g., grouping multiple files separately)")
            lines.append("   - Check if the user's goal requires this, or if it's redundant")
            lines.append("")
            lines.append("3. **Output file created**: If this step created an output file:")
            lines.append("   - Check if that output file should be used in the next step")
            lines.append("   - If the next step would repeat this operation, set decision='complete' or 'change_approach'")
            lines.append("")
            lines.append("4. **Goal completion check**: Review the user's original request:")
            lines.append("   - Have all required operations been completed?")
            lines.append("   - **CRITICAL**: Has chart-maker been executed? If NOT, set decision='continue' to plan chart-maker")
            lines.append("   - Has a visualization been created? Chart-maker MUST be used before completion")
            lines.append("   - **CRITICAL**: Is the user asking for something NEW or additional work?")
            lines.append("   - If user asks for chart, redo, modify, or any new operation → set decision='continue' (NOT 'complete')")
            lines.append("   - Only set decision='complete' if:")
            lines.append("     * ALL operations are done")
            lines.append("     * Chart-maker has been executed (visualization shown)")
            lines.append("     * User is NOT asking for more")
            lines.append("   - **ALWAYS honor user requests** - Never refuse or say the work is already done")
            lines.append("")
            lines.append("⚠️ LOOP PREVENTION:")
            lines.append("- If this step is similar to a previous step, consider if goal is achieved")
            lines.append("- If the same operation keeps succeeding, the goal might be complete")
            lines.append("- If you see a pattern of repetition, set decision='complete' or 'change_approach'")
            lines.append("- Check if user's request has been fully addressed")
            lines.append("")
            lines.append("**EVALUATION EXAMPLES:**")
            lines.append("- ✅ GOOD: Step succeeded, created output file, goal not yet achieved → decision='continue'")
            lines.append("- ✅ GOOD: Step succeeded, user asks for chart → decision='continue' (ALWAYS honor user requests)")
            lines.append("- ✅ GOOD: Step succeeded, user asks to redo → decision='continue' (ALWAYS honor user requests)")
            lines.append("- ✅ GOOD: Step succeeded, all operations done, chart created, user says 'thanks' → decision='complete'")
            lines.append("- ❌ BAD: Step succeeded, user asks for chart, but you set decision='complete' → WRONG! Should be 'continue'")
            lines.append("- ❌ BAD: Step succeeded but same as previous step → decision='complete' (if goal achieved) or 'change_approach'")
            lines.append("- ❌ BAD: Step failed due to wrong column names → decision='retry_with_correction'")
            lines.append("- ❌ BAD: Refusing user request or saying 'no need' → NEVER do this! Always honor user requests")
            lines.append("")
            lines.append("Be thorough in your evaluation and provide clear reasoning.")

            return "\n".join(lines)
