#!/bin/bash

# Extract Section Script
# ----------------------
# Extracts a specific regulatory section from a markdown file by section number.
# Attempts to isolate the section from its header to the next section header.
#
# Usage:
#   ./extract_section.sh FILE "213-72"
#   ./extract_section.sh FILE "213-72" --with-lines    # Include line numbers
#
# Returns:
#   - Exit code 0: Success (section content printed to stdout)
#   - Exit code 1: Failure (section not found or error)

# Check arguments
if [ $# -lt 2 ]; then
    echo "Usage: $0 <file> <section_number> [--with-lines]" >&2
    echo "Example: $0 regulation.md \"213-72\"" >&2
    exit 1
fi

FILE="$1"
SECTION="$2"
WITH_LINES=false

if [ "$3" = "--with-lines" ]; then
    WITH_LINES=true
fi

# Check if file exists
if [ ! -f "$FILE" ]; then
    echo "Error: File not found: $FILE" >&2
    exit 1
fi

# Escape special regex characters in section number
SECTION_ESCAPED=$(echo "$SECTION" | sed 's/[.[\*^$]/\\&/g')

# Find the line number where this section starts
# Look for common section header patterns:
# - § 213-72 or § 213-72 (UTF-8 encoding)
# - §213-72
# - § 213-72Certificate (no space after section number)
# - [§ 213-72
# - Section 213-72
# Use case-insensitive grep and look for the section number pattern
START_LINE=$(grep -n "${SECTION_ESCAPED}" "$FILE" | grep -E "(^[0-9]+:.*§.*${SECTION_ESCAPED}|^[0-9]+:.*Section.*${SECTION_ESCAPED})" | head -1 | cut -d: -f1)

if [ -z "$START_LINE" ]; then
    echo "Error: Section § $SECTION not found in $FILE" >&2
    echo "Hint: Try searching the file first with: grep -i \"$SECTION\" \"$FILE\"" >&2
    exit 1
fi

# Find the next section header after this one
# This marks the end of the current section
NEXT_SECTION_LINE=$(awk -v start="$START_LINE" 'NR > start && /§ [0-9]/ {print NR; exit}' "$FILE")

# If no next section found, extract to end of file
if [ -z "$NEXT_SECTION_LINE" ]; then
    END_LINE=$(wc -l < "$FILE")
else
    # Extract up to (but not including) the next section
    END_LINE=$((NEXT_SECTION_LINE - 1))
fi

# Calculate section size
SECTION_SIZE=$((END_LINE - START_LINE + 1))

# Output the section
if [ "$WITH_LINES" = true ]; then
    echo "Section § $SECTION (lines $START_LINE-$END_LINE, $SECTION_SIZE lines):" >&2
    echo "---" >&2
    sed -n "${START_LINE},${END_LINE}p" "$FILE" | nl -ba -v "$START_LINE"
else
    sed -n "${START_LINE},${END_LINE}p" "$FILE"
fi

exit 0
