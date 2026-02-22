#!/bin/bash

# Clean eCode360/Municode Navigation Script
# ------------------------------------------
# Removes navigation elements, menus, and UI text from ecode360 and municode sites
# while preserving actual regulatory content.
#
# Usage:
#   cat file.md | ./clean_ecode360.sh              # Filter from stdin
#   ./clean_ecode360.sh < input.md > output.md     # Filter file
#
# Removes:
# - Navigation links and menus
# - UI elements (search, login, help)
# - Chapter/article lists (preserves actual content)
# - Breadcrumbs and site chrome
# - Action buttons (print, email, download, share)

# Read from stdin
content=$(cat)

# Remove common navigation patterns
content=$(echo "$content" | sed -E '
# Remove home/code navigation
/^\[?homeHome\]?(\(https?:\/\/ecode360|$)/d
/^\[?codeCode\]?(\(https?:\/\/ecode360|$)/d
/^\[?Code\]?(\(https?:\/\/ecode360|$)/d
/^\[?Index\]?(\(https?:\/\/ecode360|$)/d

# Remove help/support navigation
/^\[?help_?centerHelp\]?/d
/^\[?Help\]?(\(https?:\/\/ecode360|$)/d
/^\[?Welcome\]?(\(https?:\/\/ecode360|$)/d
/^\[?Basic Navigation\]?/d
/^\[?Toolbar\]?(\(https?:\/\/ecode360|$)/d
/^\[?Searching\]?(\(https?:\/\/ecode360|$)/d
/^\[?FAQ\]?(\(https?:\/\/ecode360|$)/d
/^\[?Request Support\]?/d
/^\[?About\]?(\(https?:\/\/ecode360|$)/d

# Remove action buttons
/^\[?printPrint\]?(\(https?:\/\/ecode360|$)/d
/^\[?emailEmail\]?(\(mailto:|$)/d
/^\[?downloadDownload\]?(\(https?:\/\/ecode360|$)/d
/^\[?shareShare\]?(\(mailto:|$)/d
/^\[?add_?alertGet Updates\]?/d

# Remove UI elements
/^search$/d
/^ecode$/d
/^\[?ecode\]?(\(https?:\/\/ecode360|$)/d
/^\[?Login\]?(\(https?:\/\/ecode360|$)/d
/^Jump to\.\.\.$/d

# Remove navigation arrows
/^\[?arrow_?back\]?(\(https?:\/\/ecode360|$)/d
/^\[?arrow_?forward\]?(\(https?:\/\/ecode360|$)/d
/^\[?chevron_?right\]?(\(https?:\/\/ecode360|$)/d
/^\[?chevron_?left\]?(\(https?:\/\/ecode360|$)/d

# Remove "New Laws" links
/^\[?gavelNew Laws.*\]?(\(https?:\/\/ecode360|$)/d
/^\[?New Laws\]?(\(https?:\/\/ecode360|$)/d

# Remove "Public Documents" links
/^\[?Public Documents\]?(\(https?:\/\/ecode360|$)/d

# Remove standalone navigation words
/^(Tools: Municipal Users|Tools: Administrators)$/d
')

# Remove chapter listing navigation (but preserve actual chapter content)
# This targets standalone chapter references like "Ch 213Zoning" without content
content=$(echo "$content" | sed -E '
/^Ch [0-9]+[A-Za-z ]+$/{
    # Check if next line is also a chapter reference (navigation list)
    N
    /^Ch [0-9]+[A-Za-z ]+\nCh [0-9]+[A-Za-z ]+$/d
    # If not, put the line back
    P
    D
}
')

# Remove administrative/general legislation headers when they appear as navigation
content=$(echo "$content" | sed -E '
/^Administrative Legislation$/d
/^General Legislation$/d
')

# Remove empty markdown links
content=$(echo "$content" | sed -E '
/^\[\]\([^)]*\)$/d
')

# Remove excessive blank lines (more than 2 consecutive)
content=$(echo "$content" | sed -E '
:a
/^\s*$/{ 
    N
    /^\s*\n\s*\n\s*$/s/\n//
    ta
}
')

# Output cleaned content
echo "$content"

exit 0
