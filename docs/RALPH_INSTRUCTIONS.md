# Ralph: Autonomous Sub-Agent Orchestration Pattern

## Overview

Ralph is an autonomous sub-agent pattern for executing complex, multi-step tasks in the background. Named informally during development, it enables an AI agent to delegate substantial work packages to background sub-agents that operate independently, tracking progress via structured files.

**Key Concept:** A main Claude session delegates work to a background "Ralph" that operates autonomously, consulting a prd.json for tasks and PROMPT.md for instructions, then outputs findings to designated files.

---

## When to Use Ralph

### Ideal Use Cases

| Scenario | Why Ralph Works |
|----------|-----------------|
| **Research Tasks** | Prior art searches, codebase exploration, patent analysis - tasks requiring multiple searches and synthesis |
| **Implementation Tasks** | Multi-file code changes following a specification document |
| **Testing Tasks** | Comprehensive test suite creation across multiple files |
| **Documentation Tasks** | Creating structured documentation from multiple sources |
| **Migration Tasks** | Database migrations, refactoring across many files |

### When NOT to Use Ralph

- Single-file edits
- Quick questions or lookups
- Tasks requiring real-time user interaction
- Tasks that depend on immediate user feedback

### Decision Criteria

Use Ralph when:
1. Task has 5+ distinct sub-tasks
2. Work can be done asynchronously
3. Progress needs to be tracked across sessions
4. Output should be persisted to files (not just conversation)
5. Task may require multiple "sessions" to complete

---

## Core Components

### 1. prd.json - Task Definition

The Product Requirements Document in JSON format. Contains all stories (tasks) to be executed.

```json
{
  "branchName": "research/patent-completeness-review",
  "projectName": "Patent Completeness Analysis",
  "researchConfig": {
    "outputDirectory": "./research-output",
    "doNotModify": ["path/to/protected/files"],
    "principle": "Fresh eyes - no confirmation bias."
  },
  "userStories": [
    {
      "id": "RS-001",
      "title": "Read all 4 existing provisional patents",
      "description": "Read each provisional patent. Extract title, claims, technical innovations.",
      "acceptanceCriteria": [
        "Read file path/to/patent1.md",
        "Read file path/to/patent2.md",
        "Create 01_existing_patents.md summarizing scope",
        "File <6000 tokens"
      ],
      "priority": 1,
      "passes": false,
      "outputFile": "research-output/01_existing_patents.md"
    }
  ]
}
```

**Key Fields:**

| Field | Purpose |
|-------|---------|
| `branchName` | Git branch for this work (optional) |
| `projectName` | Human-readable project name |
| `researchConfig` | Configuration for the sub-agent |
| `userStories` | Array of tasks to execute |
| `id` | Unique identifier (e.g., RS-001, IMP-001) |
| `title` | Short task title |
| `description` | What needs to be done |
| `acceptanceCriteria` | Checklist for completion |
| `priority` | Execution order (1 = first) |
| `passes` | Completion status (true/false) |
| `outputFile` | Where to write results |

### 2. PROMPT.md - Sub-Agent Instructions

Instructions for the Ralph sub-agent. Read at the start of each session.

```markdown
# [Project Name] Research Agent

## Role
You are an autonomous research agent doing [task]. [Key principles].

## CRITICAL RULES
1. **DO NOT MODIFY** [protected locations]
2. **ONE TASK PER SESSION** - complete one story per iteration
3. **OUTPUT TO** [output directory]
4. **FRESH EYES** - Don't assume anything

## Current State - READ IN ORDER
1. `prd.json` - Your tasks
2. `progress.txt` - What prior sessions discovered
3. `[output-dir]/` - Previous documents

## Workflow (FOLLOW EXACTLY)

### Step 1: Pick Next Task
- Open `prd.json`
- Find story with LOWEST priority where `passes: false`
- Read its acceptance criteria

### Step 2: Execute Research
[Task-specific instructions for each story type]

### Step 3: Create Output Document
Save to `[outputFile]`

### Step 4: Verify Quality
- All acceptance criteria met?
- Under token limit?
- Evidence for every claim?

### Step 5: Commit
```bash
git add [output-dir]/
git commit -m "research: [ID] - [Title]"
```

### Step 6: Update Tracking
- Update prd.json: Set `"passes": true`
- Append to progress.txt

### Step 7: Check Completion
If ALL stories pass: `<promise>COMPLETE</promise>`
```

### 3. progress.txt - Progress Log

Append-only log of findings from each completed story.

```text
# Progress Log
# Each Ralph iteration appends findings below
# DO NOT OVERWRITE - APPEND ONLY
# Started: January 12, 2026

## RS-001: Read existing patents - COMPLETE
- Read all 4 provisional patent specifications
- Created 01_existing_patents.md summarizing scope
- Patent #1: Multi-protocol integration (4 innovations)
- FLAG: Verify Patent #3 claims vs actual code

## RS-002: Git log analysis - COMPLETE
- Analyzed 55 commits from June 2025 to January 2026
- Categorized: SMS Flow (16), QIE/HL7 (10), Webhooks (8)
- FINDING: Patent #3 claims may describe PLANNED features

=== ALL STORIES COMPLETE ===
```

### 4. Output Directory

Structured output files from each story:

```
research-output/
  01_existing_patents.md
  02_radscheduler_commits.md
  03_radorderpad_commits.md
  ...
  11_GAP_ANALYSIS.md
  round2/
    01_prior_art_scheduling_profiles.md
    ...
```

---

## How to Launch Ralph

### Method 1: Task Tool (Recommended)

Use the Task tool to spawn a background sub-agent:

```
Use the Task tool with:
- subagent_type: "general-purpose"
- description: "Execute next research story from prd.json"
- prompt: "Read PROMPT.md for instructions. Execute the next incomplete story from prd.json (lowest priority where passes: false). Follow the workflow exactly."
- run_in_background: true
- model: "opus" (for complex tasks) or "haiku" (for simple tasks)
```

### Method 2: Direct Claude Session

In a new Claude Code session:

```
Read C:/path/to/project/PROMPT.md and follow the instructions exactly.
Start with the next incomplete story in prd.json.
```

### Model Selection

| Task Complexity | Recommended Model | Use Case |
|-----------------|-------------------|----------|
| Complex research | opus | Prior art analysis, synthesis, gap analysis |
| Code implementation | opus | Multi-file changes, complex logic |
| Simple extraction | haiku | Reading files, summarizing, git log parsing |
| Testing | opus | Test suite creation |

---

## How to Monitor Ralph

### 1. Check prd.json Status

```bash
cat prd.json | grep '"passes"' | head -20
```

Count completed vs pending:
```bash
grep '"passes": true' prd.json | wc -l
grep '"passes": false' prd.json | wc -l
```

### 2. Check progress.txt

```bash
cat progress.txt | tail -50
```

Look for:
- `COMPLETE` markers
- `FLAG` or `FINDING` annotations
- `=== ALL STORIES COMPLETE ===` at end

### 3. Check Output Files

```bash
ls -la research-output/
```

Verify each completed story has its output file.

### 4. Use TaskOutput Tool

If Ralph was launched with `run_in_background: true`:

```
Use TaskOutput to check the status of the background task.
```

### 5. Git Log

```bash
git log --oneline -10
```

Look for commits matching the pattern: `research: [ID] - [Title]`

---

## Best Practices

### Story Design

1. **One task per story** - Each story should complete in one session
2. **Clear acceptance criteria** - Numbered checklist, specific files to read/create
3. **Token limits** - Specify maximum file size (e.g., "File <6000 tokens")
4. **Evidence required** - "Source: file/commit/search" for every claim

### Output Quality

1. **Structured format** - Use consistent markdown structure
2. **Executive summary** - 2-3 sentences at top of each output
3. **Sources section** - List all files, commits, searches consulted
4. **Implications section** - What does this mean for the project?

### Workflow Discipline

1. **Sequential priority** - Always pick lowest priority incomplete story
2. **Commit after each story** - Persist progress to git
3. **Update tracking files** - Both prd.json (passes: true) and progress.txt
4. **Verify before marking complete** - Check all acceptance criteria

### Error Handling

1. **Cannot complete story** - Document blockers in progress.txt, do NOT mark passes: true
2. **Need user input** - Create output file with questions, mark passes: false
3. **External dependency** - Note in progress.txt, move to next story if possible

---

## Examples from This Project

### Example 1: Research Ralph (11 Stories)

**Purpose:** Patent completeness analysis - research prior art, analyze code, identify gaps.

**File:** `C:/apps/radscheduler/prd.json`

**Stories:**
- RS-001 to RS-007: Code and document analysis (read patents, git logs, source files)
- RS-008 to RS-010: Prior art research (Perplexity searches)
- RS-011: Gap analysis synthesis (combine all findings)

**Output:** `research-output/01_existing_patents.md` through `research-output/11_GAP_ANALYSIS.md`

**Key Pattern:** Perplexity searches routed through Task tool to isolate from main context.

### Example 2: Research Round 2 (6 Stories)

**Purpose:** Deep-dive prior art research on specific innovations.

**File:** `C:/apps/radscheduler/prd-research-round2.json`

**Stories:**
- RR-001 to RR-005: Specific prior art searches
- RR-006: Synthesis with patent claim recommendations

**Output:** `research-output/round2/01_prior_art_scheduling_profiles.md` through `06_NOVEL_INNOVATIONS_SYNTHESIS.md`

**Key Pattern:** Each story focuses on ONE innovation area with specific search queries.

### Example 3: Implementation Ralph (13 Stories)

**Purpose:** Implement the intelligent scheduling feature per specification.

**File:** `C:/apps/radscheduler/prd-implementation.json`

**Stories:**
- IMP-001 to IMP-003: Database and service layer
- IMP-004 to IMP-006: Core services (safety, duration, webhooks)
- IMP-007 to IMP-010: Integration into SMS flow
- IMP-011 to IMP-013: Testing and seed data

**Output:** Source files (`api/src/services/*.js`, `api/db/migrations/*.sql`)

**Key Pattern:** Each story creates specific files with testable acceptance criteria.

---

## Advanced Patterns

### Chained Ralph Sessions

For very large tasks, chain multiple Ralph configurations:

1. **Phase 1 Ralph:** Research and analysis
   - prd.json: Research stories
   - Output: research-output/

2. **Phase 2 Ralph:** Implementation based on research
   - prd-implementation.json: Implementation stories
   - Input: Research findings
   - Output: Source code

3. **Phase 3 Ralph:** Testing and documentation
   - prd-testing.json: Test stories
   - Input: Implementation
   - Output: Test files

### Parallel Ralph Sessions

Launch multiple Ralphs for independent workstreams:

```
# Terminal 1: Research Ralph
Read PROMPT.md and execute prd-research.json

# Terminal 2: Implementation Ralph (independent stories)
Read PROMPT-impl.md and execute prd-implementation.json
```

**Caution:** Ensure stories don't conflict (modify same files).

### Perplexity Integration

For research tasks requiring web searches, route through sub-agents:

```markdown
## RS-008: Prior art search

Use Task tool:
{
  "subagent_type": "general-purpose",
  "description": "Prior art research: safety checks",
  "prompt": "Use Perplexity MCP to search: [queries]. Return 10-15 references."
}
```

This isolates long search results from the main context.

---

## Troubleshooting

### Ralph Not Picking Up Next Story

**Symptom:** Sub-agent starts but doesn't execute next story.

**Check:**
1. prd.json valid JSON?
2. Any stories with `passes: false`?
3. PROMPT.md instructions clear?

### Output File Not Created

**Symptom:** Story marked complete but no output file.

**Check:**
1. Output directory exists?
2. File path in `outputFile` correct?
3. Git commit includes the file?

### Progress Lost Between Sessions

**Symptom:** Ralph re-does completed work.

**Check:**
1. prd.json updated with `passes: true`?
2. Changes committed to git?
3. Session reading correct prd.json file?

### Quality Issues in Output

**Symptom:** Output files incomplete or off-topic.

**Fix:**
1. Add more specific acceptance criteria
2. Add token limits ("File <5000 tokens")
3. Require sources ("Evidence for every claim")
4. Use opus model for complex synthesis

---

## Template Files

### Minimal prd.json Template

```json
{
  "projectName": "My Task",
  "userStories": [
    {
      "id": "T-001",
      "title": "First task",
      "description": "What to do",
      "acceptanceCriteria": [
        "Specific criterion 1",
        "Specific criterion 2"
      ],
      "priority": 1,
      "passes": false,
      "outputFile": "output/01_first_task.md"
    }
  ]
}
```

### Minimal PROMPT.md Template

```markdown
# [Task Name] Agent

## Role
You are an autonomous agent executing [task type].

## Rules
1. ONE TASK PER SESSION
2. OUTPUT TO [directory]

## Workflow
1. Read prd.json, find next incomplete story (lowest priority, passes: false)
2. Execute the task per acceptance criteria
3. Create output file at outputFile path
4. Update prd.json: set passes: true
5. Append summary to progress.txt
6. Commit: `git add . && git commit -m "[ID] - [Title]"`
```

---

## Summary

Ralph is a powerful pattern for autonomous background work:

1. **Define tasks** in prd.json with clear acceptance criteria
2. **Provide instructions** in PROMPT.md with explicit workflow
3. **Track progress** via passes field and progress.txt
4. **Output to files** for persistence and review
5. **Commit incrementally** after each completed story

The pattern scales from simple research (11 stories) to full implementations (13+ stories) and can be chained for complex multi-phase projects.
