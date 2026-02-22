#!/bin/bash

# Firecrawl Fallback Script for Regulatory Research
# --------------------------------------------------
# This script provides a fallback scraping mechanism when web_fetch fails.
# Use this ONLY as a last resort after web_fetch has failed.
#
# NEW FEATURES:
# - Auto-detects document size and outputs to file if >10,000 characters
# - Optional --output flag to force file output
# - Optional --silent flag to suppress stderr messages
# - Auto-invokes clean_ecode360.sh for ecode360/municode sites
# - Automatic fallback to backup API key on 402/403 errors
#
# Usage:
#   ./firecrawl_fallback.sh <URL>                    # Auto-detect output method
#   ./firecrawl_fallback.sh <URL> --output FILE      # Force file output
#   ./firecrawl_fallback.sh <URL> --silent           # Suppress progress messages
#
# Returns:
#   - Exit code 0: Success (content printed to stdout or saved to file)
#   - Exit code 1: Failure (error message printed to stderr)

# Configuration
readonly API_KEY_PRIMARY="fc-0c0eb6c952e349a5ac05f0b66f067032"
readonly API_KEY_BACKUP="fc-9443c836a03e4689b805422753df7356"
readonly API_ENDPOINT="https://api.firecrawl.dev/v2/scrape"
readonly MIN_CONTENT_LENGTH=100
readonly AUTO_FILE_THRESHOLD=10000  # Characters threshold for auto file output

# Parse arguments
URL=""
OUTPUT_FILE=""
SILENT_MODE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --output)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        --silent)
            SILENT_MODE=true
            shift
            ;;
        *)
            if [[ -z "$URL" ]]; then
                URL="$1"
            fi
            shift
            ;;
    esac
done

# Color codes for output (only when terminal is interactive and not silent)
if [ -t 2 ] && [ "$SILENT_MODE" = false ]; then
    readonly RED='\033[0;31m'
    readonly GREEN='\033[0;32m'
    readonly YELLOW='\033[1;33m'
    readonly NC='\033[0m' # No Color
else
    readonly RED=''
    readonly GREEN=''
    readonly YELLOW=''
    readonly NC=''
fi

# Function to print error messages
error() {
    if [ "$SILENT_MODE" = false ]; then
        echo -e "${RED}✗ Error: $1${NC}" >&2
    fi
}

# Function to print warning messages
warning() {
    if [ "$SILENT_MODE" = false ]; then
        echo -e "${YELLOW}⚠️  Warning: $1${NC}" >&2
    fi
}

# Function to print success messages
success() {
    if [ "$SILENT_MODE" = false ]; then
        echo -e "${GREEN}✓ $1${NC}" >&2
    fi
}

# Function to print info messages
info() {
    if [ "$SILENT_MODE" = false ]; then
        echo "$1" >&2
    fi
}

# Check if URL argument is provided
if [ -z "$URL" ]; then
    error "No URL provided"
    echo "Usage: $0 <URL> [--output FILE] [--silent]" >&2
    exit 1
fi

# Validate URL format (basic check)
if [[ ! "$URL" =~ ^https?:// ]]; then
    error "Invalid URL format. URL must start with http:// or https://"
    exit 1
fi

# Check if required tools are available
if ! command -v curl &> /dev/null; then
    error "curl is not installed. Please install curl to use this script."
    exit 1
fi

# Check for jq and install if needed
JQ_CMD=""
if command -v jq &> /dev/null; then
    JQ_CMD="jq"
else
    # Try to find jq in script directory
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    LOCAL_JQ="$SCRIPT_DIR/jq"
    
    if [ -f "$LOCAL_JQ" ] && [ -x "$LOCAL_JQ" ]; then
        JQ_CMD="$LOCAL_JQ"
        warning "Using local jq binary at $LOCAL_JQ"
    else
        # Download jq if not found
        warning "jq not found. Attempting to download static binary..."
        
        # Detect architecture
        ARCH=$(uname -m)
        case "$ARCH" in
            x86_64|amd64)
                JQ_URL="https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-linux-amd64"
                ;;
            aarch64|arm64)
                JQ_URL="https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-linux-arm64"
                ;;
            *)
                error "Unsupported architecture: $ARCH. Please install jq manually."
                exit 1
                ;;
        esac
        
        # Download jq to script directory
        if curl -L -s -f "$JQ_URL" -o "$LOCAL_JQ" 2>/dev/null; then
            chmod +x "$LOCAL_JQ"
            JQ_CMD="$LOCAL_JQ"
            success "Downloaded jq to $LOCAL_JQ"
        else
            error "Failed to download jq. Please install jq manually."
            exit 1
        fi
    fi
fi

# Inform user this is a fallback
warning "FALLBACK: Using Firecrawl to scrape $URL"
info "   (This is a last resort after web_fetch failed)"

# Prepare the JSON payload
json_payload=$(cat <<EOF
{
  "url": "$URL",
  "formats": ["markdown"],
  "onlyMainContent": true,
  "timeout": 30000,
  "waitFor": 2000
}
EOF
)

# Function to make API request with a given key
# Sets global variables: http_code, response_body
make_api_request() {
    local api_key="$1"
    local key_label="$2"
    
    info "Attempting request with $key_label API key..."
    
    local response
    response=$(curl -s -S -w "\n___HTTP_CODE___:%{http_code}" \
        -X POST "$API_ENDPOINT" \
        -H "Authorization: Bearer $api_key" \
        -H "Content-Type: application/json" \
        -d "$json_payload" 2>/tmp/firecrawl_curl_error.$$)
    
    local curl_exit_code=$?
    
    # Check if curl command failed
    if [ $curl_exit_code -ne 0 ]; then
        error "CURL failed with exit code $curl_exit_code"
        if [ -f /tmp/firecrawl_curl_error.$$ ]; then
            cat /tmp/firecrawl_curl_error.$$ >&2
            rm -f /tmp/firecrawl_curl_error.$$
        fi
        return 1
    fi
    
    # Clean up temp file
    rm -f /tmp/firecrawl_curl_error.$$
    
    # Extract HTTP status code and response body (set as globals)
    http_code=$(echo "$response" | grep -o '___HTTP_CODE___:[0-9]*' | cut -d':' -f2)
    response_body=$(echo "$response" | sed '/___HTTP_CODE___:/d')
    
    return 0
}

# Try primary API key first
make_api_request "$API_KEY_PRIMARY" "primary"
request_result=$?

# If curl failed, exit
if [ $request_result -ne 0 ]; then
    exit 1
fi

# If primary key returns 402 or 403, try backup key
if [ "$http_code" = "402" ] || [ "$http_code" = "403" ]; then
    warning "Primary API key returned $http_code - trying backup key..."
    make_api_request "$API_KEY_BACKUP" "backup"
    request_result=$?
    
    if [ $request_result -ne 0 ]; then
        exit 1
    fi
fi

# Check HTTP status code
if [ -z "$http_code" ]; then
    error "Could not determine HTTP status code"
    exit 1
fi

if [ "$http_code" -ne 200 ]; then
    error "Firecrawl API returned HTTP $http_code"
    
    # Try to extract error message from response
    if [ -n "$response_body" ]; then
        error_msg=$(echo "$response_body" | "$JQ_CMD" -r '.error // .message // empty' 2>/dev/null)
        if [ -n "$error_msg" ]; then
            echo "API Error: $error_msg" >&2
        fi
    fi
    exit 1
fi

# Parse the JSON response to extract markdown content
markdown_content=$(echo "$response_body" | "$JQ_CMD" -r '.data.markdown // empty' 2>/dev/null)

# Check if jq parsing was successful
if [ $? -ne 0 ]; then
    error "Failed to parse JSON response"
    exit 1
fi

# Check if content was extracted
if [ -z "$markdown_content" ] || [ "$markdown_content" = "null" ]; then
    error "Firecrawl returned empty content"
    exit 1
fi

# Validate content length
content_length=${#markdown_content}
if [ $content_length -lt $MIN_CONTENT_LENGTH ]; then
    warning "Content too short ($content_length chars), may not be actual regulatory text"
fi

success "Successfully scraped $content_length characters using Firecrawl"

# Detect if this is an ecode360 or municode site and apply cleaning
if [[ "$URL" =~ ecode360\.com ]] || [[ "$URL" =~ municode\.com ]]; then
    CLEAN_SCRIPT="$(dirname "${BASH_SOURCE[0]}")/clean_ecode360.sh"
    if [ -f "$CLEAN_SCRIPT" ]; then
        info "Detected ecode360/municode site - applying automatic filtering"
        markdown_content=$(echo "$markdown_content" | bash "$CLEAN_SCRIPT")
        success "Removed navigation elements (final size: ${#markdown_content} chars)"
    fi
fi

# Auto-detect if file output is needed based on size
if [ -z "$OUTPUT_FILE" ] && [ $content_length -gt $AUTO_FILE_THRESHOLD ]; then
    OUTPUT_FILE="/tmp/firecrawl_$(date +%s)_$(echo "$URL" | md5sum | cut -d' ' -f1).md"
    warning "Content exceeds $AUTO_FILE_THRESHOLD characters - auto-saving to file"
    info "Output file: $OUTPUT_FILE"
fi

# Output content
if [ -n "$OUTPUT_FILE" ]; then
    echo "$markdown_content" > "$OUTPUT_FILE"
    success "Content saved to $OUTPUT_FILE"
    echo "$OUTPUT_FILE"  # Output filename to stdout for script consumption
else
    echo "$markdown_content"
fi

exit 0
