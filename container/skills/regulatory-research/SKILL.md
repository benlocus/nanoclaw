---
name: regulatory-research
description: Research and analyze state statutes, administrative regulations, and local ordinances (such as zoning codes) with rigorous attention to definitions, cross-references, and regulatory interpretation. This skill should be used when users need to locate specific regulatory provisions, understand defined terms in their regulatory context, identify compliance requirements, analyze regulatory language for mandatory vs. permissive obligations, or trace relationships between related regulatory sections. Use this skill for queries about state regulations (e.g., Massachusetts General Laws, Code of Massachusetts Regulations), local ordinances (e.g., municipal zoning codes), and related agency guidance documents.
---

# Regulatory Research - Research Methodology

## Overview

This skill provides a systematic framework for researching and analyzing state statutes, administrative regulations, and local ordinances.  It emphasizes traceability, accuracy, and thorough analysis by ensuring all findings are directly verifiable against official source documentation.  The skill prioritizes correctness over completeness—when ambiguities arise or information cannot be definitively determined, identify the gap and request clarification rather than providing potentially incorrect information.

---

## CRITICAL: Read Before Every Response

**Before responding to any regulatory research query, read:**
`/mnt/skills/user/regulatory-research/references/RESPONSE_FORMATTING.md`

This file contains mandatory requirements for:
- Inline citation format and placement
- Integrating your research thought process into responses
- Structuring complex responses
- Precise language about prohibitions and ambiguities
- Separating legal analysis from risk recommendations

**Failure to follow these formatting requirements makes responses unusable for legal/compliance purposes.**

---

## Core Research Principles

**Primary Source Requirement**: All regulatory findings must be verified against primary sources (official statute or regulation text from government websites).  Secondary sources (compliance guides, business websites, legal blogs) cannot be used to establish what a regulation requires, permits, or prohibits.  Use secondary sources only to locate primary sources or provide supplemental context.

**Correctness Over Completeness**: If uncertain about any aspect of the regulatory language, flag the ambiguity and explain what additional information or clarification is needed.  Never guess or provide potentially incorrect interpretations when the answer is unclear.  Explicitly identify gaps in research where primary sources were unavailable.

**Transparent Research Process**: Your research must demonstrate how you arrived at conclusions.  Explain research paths taken, inferences drawn from statutory structure, and gaps in available information.

**Default Interpretive Principle: Permitted Unless Prohibited**: In regulatory analysis, the default presumption is that activities are permitted unless there is a specific prohibition, licensing requirement, or general law restriction.  Do not assume that activities require explicit regulatory authorization.  The correct analytical framework is:

1. **Is there a specific prohibition?** → If yes, activity is prohibited
2. **Does it require a separate license?** → If yes, authorization needed
3. **Does it violate general law?** → Check zoning, health codes, etc.
4. **If none of the above** → Activity is likely permitted

This principle applies to all regulatory analysis.  Never infer prohibition from the absence of explicit authorization.  The burden is on regulations to prohibit or restrict activities, not on activities to be explicitly authorized.  When analyzing whether an activity is permitted, the correct formulation is "no prohibition found" rather than "not explicitly authorized."

---

## Research Workflow

### Step 1: Query Assessment and Clarification

Begin by carefully analyzing the user's query to understand what they're asking and identify any ambiguities.

**Ask clarifying questions if:**
- The jurisdiction is unclear or unstated
- Multiple possible interpretations of the query exist
- The specific regulation, statute, or code section is ambiguous
- The time frame matters (current vs. historical regulations)
- The question involves multiple regulatory schemes that need prioritization

**Examples of good clarifying questions:**
- "Are you asking about the current version of 935 CMR 500, or a specific historical version?"
- "When you say 'dispensary,' are you referring to medical marijuana dispensaries, recreational marijuana dispensaries, or both?"
- "Are you looking for state-level requirements, local requirements, or both?"

Do not proceed with research until the query is sufficiently clear to ensure accurate results.

### Step 2: Source Identification and Verification

Identify the official sources for the regulations in question and verify they are current and authoritative.

**CRITICAL TOOL USAGE:**
- Use `web_search` to LOCATE official sources (e.g., "935 CMR 500 Massachusetts official")
- Use `web_fetch` to RETRIEVE the full text from official government URLs
- NEVER rely solely on search result snippets or secondary sources for regulatory claims

**Priority hierarchy for sources:**
1. **Primary sources**: Official state/local government websites with the authoritative text of statutes and regulations
2. **Secondary sources**: Official agency guidance documents, interpretive bulletins, advisory opinions
3. **Tertiary sources**: Annotated codes with case law (use only to supplement primary sources)

**Source verification checklist:**
- Confirm the source is the official government publication
- Note the effective date and verify this is the current version
- Check for any pending amendments or recent updates
- Identify the promulgating authority (legislature, agency, municipal body)

**Common official sources:**  
See `/mnt/skills/user/regulatory-research/references/common_sources.md` for links to frequently-used official regulatory sources.

---

## PRIMARY SOURCE RETRIEVAL PROTOCOL

This is the most critical part of the research process.  You must exhaust all technical options for retrieving primary sources before pivoting to alternative research approaches.

### Quick Reference: Failed Fetch Sequence
```
web_fetch fails → Check PDF (web_fetch) → PDF direct download → Firecrawl (HTML only) → THEN alternatives
NEVER skip straight to searching for other sources
```

### STEP 1: Initial Retrieval Attempt

1. Use `web_search` to locate the official source URL
2. Use `web_fetch` on the official URL to retrieve the full regulatory text
3. **If web_fetch succeeds → STOP.  Use the fetched content for research.**
4. If web_fetch fails → Proceed to STEP 2

### STEP 2: PDF Alternative (web_fetch)

1. Check if PDF version exists (search results, page links, or swap .html for .pdf in URL)
2. If PDF found → Execute `web_fetch` with `web_fetch_pdf_extract_text=true` on the PDF URL
3. **If PDF succeeds → STOP.  Use PDF content for research.**
4. If no PDF exists or web_fetch on PDF fails → Proceed to STEP 2.5

### STEP 2.5: PDF Direct Download + Local Extraction

**Use this for large PDFs (e.g., full zoning ordinances) where web_fetch may truncate or fail.**

1. Download the PDF directly and extract text locally:
```bash
curl -sL "[PDF_URL]" -o /home/claude/[filename].pdf && \
pdftotext /home/claude/[filename].pdf /home/claude/[filename].txt && \
wc -l /home/claude/[filename].txt
```

2. Use grep/sed for targeted extraction (avoids loading entire document into context):
```bash
# Find relevant sections
grep -n -i "[search term]" /home/claude/[filename].txt | head -30

# Extract specific line range
sed -n '[start],[end]p' /home/claude/[filename].txt
```

3. **If direct download + extraction succeeds → STOP.  Use extracted content for research.**
4. If PDF download fails or pdftotext unavailable → Proceed to STEP 3

### STEP 3: Firecrawl Retrieval (HTML Sources Only)

**Firecrawl is for HTML-based sources only.  Do NOT use firecrawl for large PDFs—use STEP 2.5 instead.**

1. Identify source type:
   - **ecode360, municode, or HTML-based code** → Firecrawl the HTML URL
   - **Government PDF document** → Return to STEP 2.5 (direct download)
2. Execute firecrawl on the HTML URL (see Firecrawl Usage section below)
3. **If firecrawl succeeds → STOP.  Use firecrawl content for research.**
4. If firecrawl fails → Proceed to MANDATORY CHECKPOINT

---

### ⚠️ MANDATORY CHECKPOINT: Before Alternative Research

**You may NOT proceed to search for alternative sources until you verify:**

```
PRIMARY SOURCE RETRIEVAL VERIFICATION:
□ Have I attempted web_fetch on the primary URL?
□ Have I attempted web_fetch on PDF (if PDF exists)?
□ Have I attempted PDF direct download + pdftotext (if PDF exists)?
□ Have I attempted firecrawl on HTML source (if applicable)?

If ANY checkbox is unchecked → Return and complete that step
If ALL are checked → Document what failed and proceed to STEP 4
```

**This checkpoint is mandatory.**  Do not rationalize that you "tried something similar."  You must complete ALL three retrieval attempts before searching for alternative sources.

---

### STEP 4: Alternative Official Sources

**Only after passing the checkpoint above:**

1. Search for the same ordinance/regulation on alternative official government sites
2. Look for official agency-hosted versions
3. Try state legislative archives or Secretary of State repositories
4. Check if the municipality uses a third-party hosting service (GeneralCode, Municode)

**Document the limitation:**  
Explicitly state in your response which primary source you couldn't access and what alternative you used.

### STEP 5: Partial Information Research

**Only if Steps 1-4 fail:**

When you cannot access the complete primary source, construct the most accurate answer possible using:
- Search result snippets from official sources (cite as snippets, not primary sources)
- Secondary sources (agency guidance, legal summaries) with explicit disclosure
- Related sections you could access

**CRITICAL**: Be explicit about the limitation in your response.  State clearly what you couldn't access and how this affects the completeness of your answer.

---

## Firecrawl Usage

**Firecrawl Decision Tree:**

```
Can I retrieve the content with web_fetch?
├─ YES → Use web_fetch (DO NOT use firecrawl)
└─ NO → Is there a PDF version?
    ├─ YES → Try web_fetch on PDF with web_fetch_pdf_extract_text=true
    │        └─ PDF works? → Use PDF (DO NOT use firecrawl)
    │        └─ PDF fails? → Try direct download + pdftotext
    │                        └─ Direct download works? → Use extracted text
    │                        └─ Direct download fails? → Is source HTML-based?
    │                                                    ├─ YES → Proceed to firecrawl
    │                                                    └─ NO → Document failure, try alternatives
    └─ NO → Is source HTML-based (ecode360, municode, etc.)?
            ├─ YES → Proceed to firecrawl
            └─ NO → Document failure, try alternatives
```

**To use firecrawl with file-based output:**

Execute the firecrawl script - it will automatically handle output:
```bash
OUTPUT=$(bash /mnt/skills/user/regulatory-research/scripts/firecrawl_fallback.sh "$URL")
```

**Automatic behavior:**
- Documents < 10,000 characters: Output to stdout (captured in `$OUTPUT` variable)
- Documents ≥ 10,000 characters: Auto-save to `/tmp/firecrawl_[timestamp]_[hash].md` (filepath returned in `$OUTPUT`)
- ecode360/municode URLs: Navigation automatically filtered via `clean_ecode360.sh`

**When firecrawl is appropriate:**
- ecode360 sites that fail with web_fetch
- municode sites that fail with web_fetch
- Official government sites with JavaScript-heavy interfaces
- Sites that return incomplete content with web_fetch

**When firecrawl is NOT appropriate:**
- You haven't tried web_fetch first
- You haven't tried PDF (web_fetch or direct download) if available
- **Large PDF documents** (use direct download + pdftotext instead—more efficient)
- The URL is not an official government source
- You're trying to bypass the primary source retrieval protocol

**File-based workflow for large documents:**

When firecrawl returns a filepath (document ≥10k chars):
```bash
# Firecrawl returns filepath
OUTPUT_FILE=$(bash /mnt/skills/user/regulatory-research/scripts/firecrawl_fallback.sh "$URL")

# Preview structure (first 100 lines)
view "$OUTPUT_FILE" --view_range [1, 100]

# Search for specific section
bash -c "grep -n '§ 213-72' '$OUTPUT_FILE'"

# Extract specific section only
bash /mnt/skills/user/regulatory-research/scripts/extract_section.sh "$OUTPUT_FILE" "213-72"
```

**Exit codes:**
- `0` - Success (content retrieved)
- `1` - Failure (error message to stderr)

---

## Large Document Handling

**CRITICAL**: Large regulatory documents (>10,000 characters) must use file-based workflows to prevent context window exhaustion.  The firecrawl script automatically detects document size and handles this appropriately.

### Workflow Pattern for Large Documents

**Step 1: Retrieve with automatic file handling**
```bash
OUTPUT=$(bash /mnt/skills/user/regulatory-research/scripts/firecrawl_fallback.sh "$URL")
```

If document is large, `$OUTPUT` contains filepath: `/tmp/firecrawl_1234567890_hash.md`

**Step 2: Preview structure to understand organization**
```bash
# View first 100 lines to see table of contents, structure, major sections
view "$OUTPUT" --view_range [1, 100]
```

**Step 3: Locate specific content**
```bash
# Search for section numbers, keywords, or topics
bash -c "grep -n 'keyword' '$OUTPUT'"
# Returns: line_number: matching text
```

**Step 4: Extract relevant sections only**
```bash
# Extract specific section by number
bash /mnt/skills/user/regulatory-research/scripts/extract_section.sh "$OUTPUT" "213-72"

# Or view specific line range
view "$OUTPUT" --view_range [450, 650]
```

### Helper Scripts Reference

All scripts located in: `/mnt/skills/user/regulatory-research/scripts/`

**Available tools:**
- `firecrawl_fallback.sh` - Primary retrieval tool with auto file handling
- `clean_ecode360.sh` - Automatically filters ecode360/municode navigation (auto-invoked)
- `extract_section.sh` - Isolate specific § sections from large documents

**Detailed documentation:** See `/mnt/skills/user/regulatory-research/scripts/README.md`

### Size Guidelines

| Content Size | Handling Method |
|--------------|-----------------|
| < 10,000 chars | Direct to context (automatic) |
| ≥ 10,000 chars | File-based with selective loading (automatic) |
| > 50,000 chars | MANDATORY file-based + section extraction |

### Example: Complete Large Document Workflow

```bash
# User asks: "What are the site plan approval requirements in Meriden, CT § 213-72?"

# Step 1: Attempt web_fetch (fails on ecode360)
web_fetch "https://ecode360.com/13398499"
# Result: Fails or incomplete

# Step 2: Use firecrawl fallback (automatic file output for large docs)
OUTPUT=$(bash /mnt/skills/user/regulatory-research/scripts/firecrawl_fallback.sh "https://ecode360.com/13398499")
# Result: $OUTPUT = "/tmp/firecrawl_1698765432_a3f89b2c.md"

# Step 3: Preview structure
view "$OUTPUT" --view_range [1, 100]
# Observe: Document has Article XI: Site Plan Approval starting around line 450

# Step 4: Find exact section
bash -c "grep -n '§ 213-72' '$OUTPUT'"
# Result: 485:§ 213-72 Certificate of approval required

# Step 5: Extract just that section
bash /mnt/skills/user/regulatory-research/scripts/extract_section.sh "$OUTPUT" "213-72"
# Result: Full § 213-72 text loaded to context (manageable size)

# Step 6: Analyze the section and answer user's question
# [Provide answer with inline citations]
```

### Context Efficiency Best Practices

1. **Never load entire large documents into context** - Always preview then extract
2. **Use grep to locate before loading** - Identify line numbers first
3. **Extract minimum necessary content** - Load only relevant sections
4. **Leverage automatic filtering** - ecode360/municode navigation removed automatically

---

## Step 3: Analysis and Interpretation

After successfully retrieving primary sources, conduct your analysis.

**Core analytical tasks:**
1. **Identify defined terms**: Always check the definitions section first; never use common meanings for terms that are defined in the regulation
2. **Map requirements**: Distinguish mandatory ("shall," "must") from permissive ("may") language
3. **Follow cross-references**: When a section references another section, retrieve and analyze that section too
4. **Check for exceptions**: Look for provisions that create exceptions to general rules
5. **Apply interpretive principle**: Use "permitted unless prohibited" framework
6. **Parse provision structure**: When a provision contains multiple clauses, distinguish operative prohibitions from illustrative examples (often introduced by "including but not limited to").  Lead your analysis with the operative text that most directly addresses the fact pattern, not the examples.  Illustrative examples exist to clarify ambiguous operative text—but when the operative text itself is unambiguous and directly applicable, leading with an example weakens the analysis.

**For complex queries:**  
Review `/mnt/skills/user/regulatory-research/references/EXAMPLES.md` for detailed research approach examples covering definition queries, compliance queries, zoning queries, and complex multi-restriction analyses.

---

## Response Formatting Essentials

### Critical Requirements for Every Response

**1. Inline Citations (Mandatory)**

Every statement about laws, regulations, or policies MUST have an immediate inline citation in brackets:
- `[935 CMR 500.105(2)(a)]` for regulations
- `[Conn. Gen. Stat. § 21a-420(44)]` for statutes
- `[Norton Zoning Code § 6.11.3]` for local ordinances

**2. Explain Your Reasoning**

Integrate your thought process throughout:
- "I began by examining [source] to identify..."
- "This interpretation relies on the principle of..."
- "Reading these provisions together suggests..."
- "I was unable to access [source], which limits..."

**3. Precise Language About Prohibitions**

✅ Correct formulations:
- "No prohibition found in the regulations"
- "The regulations do not address this activity"
- "Not restricted by the regulations"

❌ Incorrect formulations:
- "Likely prohibited"
- "Appears not to be allowed"
- "Probably not permitted"

**4. Separate Legal Analysis from Recommendations**

Create distinct sections:
- **Legal Analysis**: What regulations actually state [with citations]
- **Risk Assessment**: Prudent business advice given regulatory uncertainty
- **Verification Recommendations**: Next steps for obtaining definitive guidance

**For complete formatting requirements, examples, and templates:**  
Read `/mnt/skills/user/regulatory-research/references/RESPONSE_FORMATTING.md` before responding.

---

## Resources

### references/RESPONSE_FORMATTING.md
**When to read**: ALWAYS read before responding to any regulatory research query.

Contains mandatory requirements for citations, structure, language precision, and detailed examples of properly formatted responses.

### references/EXAMPLES.md
**When to read**: Before conducting research on complex queries involving multiple sections or when you need guidance on structuring your research approach.

Contains detailed step-by-step examples for:
- Simple definition queries
- Complex compliance queries
- Zoning queries
- Multi-restriction activity permission analyses

### references/structured_output_template.md
**When to read**: When conducting comprehensive regulatory research requiring analysis of 3+ sections, multiple cross-references, or when the user needs a formal report-style output.

Contains a complete template for structuring comprehensive regulatory analyses as standalone documents.

### references/common_sources.md
**When to read**: As needed during research when looking for links to official regulatory sources.

Provides links to commonly-used official sources for Massachusetts statutes, regulations, cannabis-specific resources, and guidance for finding other state and local sources.

---

## CRITICAL REMINDERS

**Before submitting any regulatory research response:**

1. ✅ **Have I read RESPONSE_FORMATTING.md?** (Required before every response)
2. ✅ **Have I exhausted all primary source retrieval options?** (web_fetch HTML, web_fetch PDF, firecrawl)
3. ✅ **Have I documented what retrieval methods failed?** (Transparency about access limitations)
4. ✅ **Am I using the correct regulatory definitions for terms?** (Not common meanings)
5. ✅ **Have I followed cross-references?** (Not stopping at first relevant section)
6. ✅ **Am I correctly distinguishing mandatory vs. permissive language?** (Shall vs. may)

**ANALYTICAL CHECKLIST - Before presenting conclusions:**

7. ✅ **Have I applied the default interpretive principle?** (Permitted unless prohibited—not vice versa)
8. ✅ **Have I identified the regulatory target correctly?** (Who/what is actually being regulated?)
9. ✅ **Have I avoided conflating restriction types?** (Advertising ≠ operational ≠ premises ≠ licensing)
10. ✅ **Have I parsed regulatory language precisely?** (Not adding words like "only" or "exclusively")
11. ✅ **Have I led with the most directly applicable operative text?** (Not illustrative examples when operative language addresses the fact pattern more precisely)
12. ✅ **Have I avoided unsupported inferential chains?** (Each inference independently justified)
13. ✅ **Have I attributed actions to correct parties?** (Licensee vs. third party vs. property owner)
14. ✅ **Have I separated analysis from recommendations?** (Legal requirements vs. business advice)
15. ✅ **Have I used precise language?** ("No prohibition found" vs. "likely prohibited")
16. ✅ **Have I noted all ambiguities?** (Rather than manufacturing certainty)
17. ✅ **Does every statement have an inline citation?** (No exceptions)
