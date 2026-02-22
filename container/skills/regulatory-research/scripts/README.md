# Regulatory Research Helper Scripts

This directory contains utility scripts that support the regulatory research skill by handling large documents, filtering noise, and extracting specific content.

## Scripts Overview

| Script | Purpose | Auto-invoked |
|--------|---------|--------------|
| `firecrawl_fallback.sh` | Scrape content when web_fetch fails | By skill workflow |
| `clean_ecode360.sh` | Remove navigation noise from ecode360/municode | By firecrawl script |
| `extract_section.sh` | Isolate specific § sections | Manual/on-demand |

---

## firecrawl_fallback.sh

### Purpose
Retrieves regulatory content using the Firecrawl API when web_fetch fails.  Automatically detects document size and outputs to file for large documents.

### Features
- Auto-detects document size (>10,000 chars = file output)
- Automatically filters ecode360/municode navigation
- Optional manual file output specification
- Silent mode for script chaining

### Usage

**Basic (auto-detect output method):**
```bash
bash /mnt/skills/user/regulatory-research/scripts/firecrawl_fallback.sh "https://ecode360.com/13398499"
```

**Force file output:**
```bash
bash firecrawl_fallback.sh "URL" --output /tmp/output.md
```

**Silent mode (suppress progress messages):**
```bash
bash firecrawl_fallback.sh "URL" --silent
```

### Behavior

| Content Size | Action |
|--------------|--------|
| < 10,000 chars | Output to stdout |
| ≥ 10,000 chars | Auto-save to `/tmp/firecrawl_[timestamp]_[hash].md` |
| ecode360/municode URL | Automatically apply clean_ecode360.sh filter |

### Output Examples

**Small document (stdout):**
```bash
$ bash firecrawl_fallback.sh "https://example.com/regulation"
⚠️  Warning: FALLBACK: Using Firecrawl to scrape...
✓ Successfully scraped 5432 characters using Firecrawl
[markdown content follows to stdout]
```

**Large document (file):**
```bash
$ bash firecrawl_fallback.sh "https://ecode360.com/large-code"
⚠️  Warning: FALLBACK: Using Firecrawl to scrape...
✓ Successfully scraped 45231 characters using Firecrawl
⚠️  Warning: Content exceeds 10000 characters - auto-saving to file
Output file: /tmp/firecrawl_1234567890_a3f89b2c.md
✓ Content saved to /tmp/firecrawl_1234567890_a3f89b2c.md
/tmp/firecrawl_1234567890_a3f89b2c.md
```

### Exit Codes
- `0` - Success (content retrieved)
- `1` - Failure (network error, API error, parsing error)

---

## clean_ecode360.sh

### Purpose
Filters navigation elements, menus, and UI text from ecode360 and municode websites while preserving actual regulatory content.

### Auto-Invocation
Automatically called by `firecrawl_fallback.sh` when scraping ecode360.com or municode.com URLs.

### Manual Usage

**From stdin:**
```bash
cat input.md | bash clean_ecode360.sh > output.md
```

**From file:**
```bash
bash clean_ecode360.sh < input.md > output.md
```

### What It Removes
- Navigation links (Home, Code, Index)
- Help/support menus
- Action buttons (Print, Email, Download, Share)
- UI elements (Search, Login)
- Navigation arrows
- Chapter listing navigation
- Empty markdown links
- Excessive blank lines

### What It Preserves
- Section headers (§ X-XX)
- Article titles
- Actual regulatory text
- Subsection numbering
- Legal content and definitions

### Typical Results
- 30-40% reduction in file size for ecode360 documents
- Cleaner, more focused content for analysis
- Improved context window efficiency

---

## extract_section.sh

### Purpose
Extracts a specific regulatory section by its section number, isolating it from the surrounding document.

### Usage

**Basic extraction:**
```bash
bash extract_section.sh FILE "213-72"
```

**With line numbers:**
```bash
bash extract_section.sh FILE "213-72" --with-lines
```

### How It Works
1. Searches for the section header (§ 213-72, Section 213-72, etc.)
2. Identifies the start of the next section
3. Extracts all content between these boundaries
4. Outputs the isolated section

### Supported Section Formats
- `§ 213-72`
- `§213-72` (no space)
- `Section 213-72`
- `[§ 213-72` (markdown link format)

### Examples

**Extract site plan approval section:**
```bash
$ bash extract_section.sh /tmp/meriden_zoning.md "213-72"
§ 213-72
Certificate of approval required; application procedure.

[Amended 3-19-1984; 10-21-1985; 2-3-1986; 11-20-1989; 12-1-2008; 12-7-2020]

A. Purpose. The site plan approval process is intended to ensure...
[continues until next section]
```

**Extract with line numbers:**
```bash
$ bash extract_section.sh /tmp/meriden_zoning.md "213-72" --with-lines
Section § 213-72 (lines 123-245, 123 lines):
---
   123  § 213-72
   124  Certificate of approval required; application procedure.
   125  
   126  [Amended 3-19-1984; 10-21-1985...]
   ...
```

### Error Handling

**Section not found:**
```bash
$ bash extract_section.sh file.md "999-99"
Error: Section § 999-99 not found in file.md
Hint: Try searching the file first with: grep -i "999-99" "file.md"
```

**File not found:**
```bash
$ bash extract_section.sh missing.md "213-72"
Error: File not found: missing.md
```

### Exit Codes
- `0` - Success (section found and extracted)
- `1` - Failure (section not found, file not found, or invalid arguments)

---

## Common Workflows

### Workflow 1: Retrieve and Analyze Large Document

```bash
# Step 1: Retrieve with firecrawl (auto-saves to file if large)
OUTPUT=$(bash firecrawl_fallback.sh "https://ecode360.com/13398499")

# Step 2: Preview structure
head -100 "$OUTPUT"

# Step 3: Find specific section
grep -n "§ 213-72" "$OUTPUT"

# Step 4: Extract just that section
bash extract_section.sh "$OUTPUT" "213-72"

# Step 5: Cleanup
rm "$OUTPUT"
```

### Workflow 2: Manual Cleaning and Extraction

```bash
# Retrieve to file
bash firecrawl_fallback.sh "URL" --output /tmp/raw.md

# Clean navigation manually
bash clean_ecode360.sh < /tmp/raw.md > /tmp/clean.md

# Extract section
bash extract_section.sh /tmp/clean.md "213-72" > /tmp/section.md

# Analyze just the section
cat /tmp/section.md
```

### Workflow 3: Search Then Extract

```bash
FILE="/tmp/firecrawl_output.md"

# Find all sections mentioning "special exception"
grep -n "special exception" "$FILE"

# Extract the relevant section
bash extract_section.sh "$FILE" "213-73"
```

---

## Dependencies

### Required
- `bash` (any recent version)
- `curl` (for firecrawl_fallback.sh)
- `jq` (auto-installed by firecrawl_fallback.sh if missing)

### Standard Tools (pre-installed on most systems)
- `grep`, `sed`, `awk`, `cut`, `wc`, `md5sum`, `nl`

---

## File Permissions

All scripts must be executable:
```bash
chmod +x /mnt/skills/user/regulatory-research/scripts/*.sh
```

---

## Troubleshooting

### Problem: "Permission denied"
**Solution:**
```bash
chmod +x /mnt/skills/user/regulatory-research/scripts/*.sh
```

### Problem: firecrawl returns "API Error: Rate limit exceeded"
**Solution:** Wait 60 seconds and retry.  Consider implementing request delays.

### Problem: extract_section.sh returns "Section not found"
**Solution:**
1. Search the file manually: `grep -i "section-number" file.md`
2. Check section number format (may use different notation)
3. Verify the file contains the expected content

### Problem: clean_ecode360.sh removes actual content
**Solution:** This script is conservative but may need tuning for specific sites.  Check the removed patterns and adjust regex if needed.

---

## Maintenance

### Adding New Filters to clean_ecode360.sh

To add new navigation patterns:
```bash
# Edit clean_ecode360.sh
# Add new sed pattern:
/^NewPattern/d
```

### Modifying File Threshold

To change auto-file threshold in firecrawl_fallback.sh:
```bash
# Edit line 19:
readonly AUTO_FILE_THRESHOLD=15000  # Change from 10000
```

---

## Support

For issues or improvements to these scripts, document findings in the skill's issue tracker or update this README with workarounds.
