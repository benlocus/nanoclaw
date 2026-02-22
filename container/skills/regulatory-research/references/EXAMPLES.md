# Example Research Approaches

This file provides detailed examples of how to apply the regulatory research methodology for different types of queries.  Review these examples before conducting research on complex queries to understand the appropriate workflow and analytical approach.

---

## Example 1: Simple Definition Query

**User Query**: "What is the definition of a vault in the Massachusetts cannabis regulations?"

**Research Approach**:
1. Clarify if needed (current version of 935 CMR 500?)
2. Use web_search to locate official 935 CMR 500 URL
3. Use web_fetch to retrieve the full text of 935 CMR 500.002 (definitions section)
4. Extract the exact definition of "vault" from the primary source text
5. Check if "vault" definition references other defined terms
6. Provide conversational response with citation and link to official source

---

## Example 2: Complex Compliance Query

**User Query**: "What are the requirements for a community outreach meeting under 935 CMR 500?"

**Research Approach**:
1. Clarify which type of license (if multiple types require community outreach)
2. Use web_search to locate official 935 CMR 500 URL
3. Use web_fetch to retrieve sections addressing community outreach meetings
4. Identify all defined terms in the primary text ("community outreach meeting," etc.)
5. Map all requirements from primary source (notice, timing, location, content, documentation)
6. Follow cross-references to related sections using additional web_fetch calls
7. Note mandatory vs. permissive language in the regulatory text
8. Check for exceptions or alternative compliance paths
9. Create structured output with sections for each requirement category
10. Flag any ambiguities or areas requiring agency guidance

---

## Example 3: Zoning Query

**User Query**: "Where are dispensaries permitted in the Norton, MA zoning code?"

**Research Approach**:
1. Clarify type of dispensary (medical vs. recreational marijuana, if both exist)
2. Use web_search to locate Norton's official zoning ordinance URL
3. Use web_fetch to retrieve the zoning ordinance sections addressing marijuana establishments
4. From primary source text, identify permitted zoning districts
5. Check primary source for dimensional requirements (setbacks, buffers, etc.)
6. Look in primary source for additional restrictions (distance from schools, residential areas, etc.)
7. Check primary source for special permit or conditional use requirements
8. Create structured output listing:
   - Permitted districts (with section citations)
   - Prohibited areas (with section citations)
   - Special requirements (with section citations)
   - Application/approval process (with section citations)
9. Cite specific section numbers from the zoning ordinance
10. Provide link to official zoning code primary source

---

## Example 4: Activity Permission Analysis (Complex Multi-Restriction Analysis)

**User Query**: "Can a marijuana dispensary in Massachusetts host food trucks and live music at their grand opening event?"

**Research Approach**:
1. **Identify regulatory targets**: What actors and activities are involved?
   - Licensee (dispensary)
   - Third parties (food trucks, musicians)
   - Activities (hosting event, food sales, entertainment)

2. **Categorize potential restrictions**:
   - Advertising restrictions (Can they promote the event?)
   - Operational restrictions (Can they host the event?)
   - Premises restrictions (What can occur at the location?)
   - Third-party restrictions (Can food trucks operate there?)

3. **Research each restriction type separately**:
   - Use web_search and web_fetch to retrieve 935 CMR 500.105 (advertising)
   - Retrieve 935 CMR 500.103 (premises/licensing requirements)
   - Retrieve 935 CMR 500.140 (retail operational requirements)

4. **Apply default interpretive principle**:
   - For each activity, ask: "Is there a specific prohibition?"
   - Do not assume prohibition from absence of authorization

5. **Parse regulatory language precisely**:
   - Example: "Licensees limited to conducting licensed activities within premises"
   - Parse: Licensees must conduct [marijuana retail activities] at [licensed location]
   - Does NOT mean: [Only marijuana activities] can occur at location

6. **Attribute actions correctly**:
   - Food trucks selling food = third-party action (not licensee action)
   - Dispensary hosting vendors = property owner right (not regulated licensee activity)
   - Live music = third-party activity or licensee activity depending on who performs

7. **Check for prohibition on each specific activity**:
   - Hosting event: Is there a specific prohibition? (Check regulations)
   - Live music: Is there a specific prohibition? (Check regulations + local noise ordinances)
   - Food trucks: Is there a specific prohibition? (Check regulations + local business licensing)
   - Advertising event: What can be advertised? (Check advertising restrictions)

8. **Structure response**:
   - **Legal Analysis**: What regulations actually prohibit/require
   - **Activities by Category**: Permitted vs. Prohibited vs. Ambiguous
   - **Risk Assessment**: Regulatory uncertainty and prudent approaches
   - **Verification Steps**: How to obtain definitive guidance

9. **Note ambiguities explicitly**:
   - "No specific provision addresses third-party vendors on premises"
   - "This creates regulatory ambiguity; recommend CCC consultation"

10. **Separate analysis from recommendations**:
    - "Regulations do not prohibit food trucks on premises" (legal analysis)
    - "Given regulatory ambiguity, consider CCC consultation before proceeding" (risk recommendation)

---

## Usage Guidelines

**When to review these examples:**
- Before conducting research on complex queries involving multiple regulatory sections
- When the query type matches one of these examples
- When you need guidance on structuring your research approach
- When unsure about the appropriate level of detail or analysis depth

**How to use these examples:**
- Identify which example most closely matches your current query
- Follow the step-by-step approach demonstrated
- Adapt the workflow to your specific regulatory context
- Maintain the same level of thoroughness and attention to detail
