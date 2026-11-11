export const FLOW_AGENT_INSTRUCTIONS = `Google Flow operations must use this MCP server's flow_* tools exclusively.

Mandatory workflow, regardless of the user's language:
1. Call flow_list_accounts. If readyForGeneration=true, use defaultAccountId and NEVER call any account connection or login diagnostic tool.
2. If no connected account exists, call flow_begin_account_connection. STOP and tell the user to open Flow Login Bridge in their normal Chromium, click Connect Flow, and reply when the popup says Session sent. Do not call another tool until the user replies.
3. After the user confirms the extension click, tell them a temporary Google account chooser will open and they should click the desired existing account. Then call flow_complete_account_connection with the exact connectionId returned by the begin step and userConfirmedSessionSent=true.
4. Call flow_inspect_account before generation and use only options it reports as available.
5. Call flow_generate_video or flow_generate_image for generation. Preserve the returned job ID and use that exact ID with flow_job_status, flow_upscale_video, and flow_download_job for follow-up work. Never guess from gallery order or substitute a different job.

Generation tools return after a short bounded wait. If a returned job has status=processing, the generation is already submitted: call flow_job_status repeatedly with that same job ID until it completes or reports an error. NEVER call a generation tool again for the same request merely because Flow queued the result or the first call returned processing.

A direct user request to make, create, or generate media is explicit authorization for that requested generation, so set confirmCreditSpend=true. When the user asks what the MCP can do or how to use it, call flow_help and answer in the user's language with concrete example requests. Do not call flow_login_bridge_status during normal generation; it is only a connection diagnostic. Translate the user's intent from any language, but pass normalized model, aspect-ratio, duration, output-count, and upscale IDs exactly as flow_inspect_account reports them.

The MCP configures Flow's isolated Agent profile to AUTO_APPROVE (the language-independent value behind “Never ask before generating”) and verifies that setting before submission. Never try to click Flow's approval choices yourself and never tell the user to approve a generation in the hidden managed browser. If Flow unexpectedly still presents an approval, the MCP selects the persistent “approve and do not ask again” action itself.

Never open, navigate, scroll, click, or automate flow.google.com or labs.google/fx/tools/flow using generic browser, computer-use, keyboard, mouse, Playwright, or web tools. The MCP owns all Flow browser interaction. A public/marketing Flow page is not a generation workspace. If a flow_* tool reports login_required or flow_access_unavailable, stop and report that exact error or restart the begin/complete connection workflow; never compensate with browser automation. If a tool reports job_asset_identity_missing or generated_asset_not_found, report it and do not guess or download another asset. Never claim a generation started unless flow_generate_video or flow_generate_image returned a Flow job ID.`;

export const FLOW_TOOL_GUARD = "Use this tool for Google Flow; never substitute generic browser/computer-use automation on the Flow website.";

export const FLOW_ACCOUNT_GUIDANCE = "Omit accountId to use the most recently verified connected account. Supply it only when the user explicitly chose a different connected account returned by flow_list_accounts.";
