# Prior Art: AI Prompt Externalization

## Summary

Prior art search reveals that prompt management, versioning, and A/B testing are **well-established practices** with multiple commercial products (Langfuse, PromptLayer, Braintrust, etc.). The intelligent-scheduling-plan's approach to prompt externalization is **NOT NOVEL** - it describes standard industry practices.

---

## Prior Art Identified (Extensive)

### 1. Langfuse Prompt Management

**URL:** langfuse.com
**Features:**
- Centralized prompt storage and versioning
- Labels for production/staging/dev environments
- A/B testing with random traffic splitting
- Performance metrics (latency, cost, tokens)
- SDK for Python and JavaScript
- No-code UI for non-technical users

**A/B Testing Implementation:**
```python
# From Langfuse documentation
prompt_a = langfuse.get_prompt("my-prompt-name", label="prod-a")
prompt_b = langfuse.get_prompt("my-prompt-name", label="prod-b")
selected_prompt = random.choice([prompt_a, prompt_b])
```

---

### 2. PromptLayer

**URL:** promptlayer.com
**Features:**
- Prompt registry with release labels
- Visual editor for non-technical users
- A/B releases with traffic splitting
- Batch evaluations and pipelines
- User segmentation for targeted versions
- Gradual rollouts (5% -> 10% -> 50% -> 100%)

**A/B Testing Features:**
- Traffic split by percentages
- User segment targeting
- Beta user testing
- Canary deployments

---

### 3. Braintrust

**URL:** braintrust.dev
**Features:**
- Playground for prompt comparison
- Side-by-side A/B testing
- Quality scores, latency, cost tracking
- CI/CD pipeline integration
- GitHub Action for automated testing
- Quality gates for production deployment

---

### 4. LangSmith (LangChain)

**Features:**
- Commit-based versioning
- LangChain runtime integration
- Programmatic prompt management
- Cost tracking per version
- Production monitoring

---

### 5. Maxim AI

**Features:**
- Deployment rules (QueryBuilder)
- Environment separation
- RBAC for deployment permissions
- Simulation and observability
- Integrated evaluation

---

## Comparison: Prior Art vs Intelligent-Scheduling Plan

| Feature | Prior Art (Langfuse, PromptLayer) | Intelligent-Scheduling Plan |
|---------|-----------------------------------|----------------------------|
| Centralized prompt storage | YES | YES (scheduling_prompts table) |
| Version control | YES | YES (version column) |
| A/B testing weights | YES | YES (ab_test_weight column) |
| Production/dev labels | YES (labels) | YES (is_active flag) |
| Placeholder interpolation | YES | YES ({{placeholders}}) |
| Performance logging | YES | YES (scheduling_analysis_log) |
| Model configuration | YES | YES (model, max_tokens columns) |

---

## Intelligent-Scheduling Plan Schema

From the planning document:

```sql
CREATE TABLE scheduling_prompts (
  prompt_key VARCHAR(100),        -- Same as Langfuse prompt names
  prompt_template TEXT,           -- Same as external prompt storage
  model VARCHAR(100),             -- Same as model configuration
  ab_test_weight INTEGER,         -- Same as A/B traffic splitting
  is_active BOOLEAN               -- Same as production labels
);

CREATE TABLE scheduling_analysis_log (
  prompt_id INTEGER,
  input_data JSONB,
  output_data JSONB,
  latency_ms INTEGER,             -- Same as Langfuse metrics
  prompt_tokens INTEGER,          -- Same as token tracking
  completion_tokens INTEGER
);
```

This is **essentially identical** to what Langfuse, PromptLayer, and other tools already offer.

---

## Novelty Assessment

### Elements That Are NOT Novel

| Element | Prior Art Example |
|---------|-------------------|
| Prompt externalization | Langfuse, PromptLayer (2023-2024) |
| A/B testing weights | Langfuse, PromptLayer, Braintrust |
| Performance logging | All major platforms |
| Placeholder interpolation | Standard practice |
| Version management | Git-like versioning in all tools |
| Non-technical UI | Langfuse Console, PromptLayer UI |

### Potentially Novel Elements

| Element | Novelty Assessment |
|---------|-------------------|
| Healthcare scheduling context | **Possible** - domain-specific |
| Integration with safety checks | **Possible** - combined system |
| Equipment inference prompts | **Possible** - specific application |

---

## Timeline Consideration

The LLM prompt management space emerged rapidly:
- **2023:** Langfuse, PromptLayer launched
- **2024:** Braintrust, LangSmith matured
- **2025:** Industry standard practice

The intelligent-scheduling-plan.md was written **January 12, 2026** - well after prompt management became a commodity.

---

## Prior Art Documentation

### Key Langfuse Documentation:
> "Prompt management is a systematic approach to storing, versioning and retrieving prompts in LLM applications."

### Key PromptLayer Documentation:
> "A/B Releases work by dynamically overloading your release labels. You can split traffic between different prompt versions based on percentages or user segments."

### Key Braintrust Documentation:
> "A/B testing helps you verify prompt improvements with real quality scores before deployment."

---

## Patent Implications

### Low Patentability
The prompt externalization system described in intelligent-scheduling-plan is **NOT patentable** because:
1. Identical systems existed 2+ years prior
2. Multiple commercial products offer same features
3. Well-documented in public sources
4. Standard industry practice

### Possible Claims
If pursuing patent protection, would need to focus on:
- **Healthcare-specific combination** of prompt externalization + safety checks + equipment inference
- NOT on the externalization mechanism itself

---

## Recommendation

**Do NOT pursue patent protection** for the prompt externalization system as described in intelligent-scheduling-plan.md.

**Reasons:**
1. Substantial prior art (Langfuse, PromptLayer, etc.)
2. Not novel - standard industry practice
3. Would likely be rejected or invalidated

**Alternative:**
If patenting AI features, focus on the **combination** of:
- Clinical context analysis (from HL7 segments)
- Equipment requirement inference
- Safety check automation

...where the novelty is in the **application domain** (healthcare scheduling), not the prompt management mechanism.

---

## Prior Art Sources

1. Langfuse Documentation: https://langfuse.com/docs/prompt-management
2. PromptLayer A/B Testing: https://docs.promptlayer.com/why-promptlayer/ab-releases
3. Braintrust A/B Guide: https://www.braintrust.dev/articles/ab-testing-llm-prompts
4. LangSmith: https://smith.langchain.com
5. Maxim AI: https://www.getmaxim.ai
