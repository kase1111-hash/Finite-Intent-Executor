#!/bin/bash

# Certora Formal Verification Runner
# Requires CERTORAKEY environment variable to be set with your API key

set -e

echo "================================================"
echo "Finite Intent Executor - Formal Verification"
echo "================================================"

# Check for API key
if [ -z "$CERTORAKEY" ]; then
    echo "Error: CERTORAKEY environment variable not set"
    echo "Please set your Certora API key:"
    echo "  export CERTORAKEY=your_api_key_here"
    echo ""
    echo "Get an API key at: https://www.certora.com/"
    exit 1
fi

echo "API key found. Starting verification..."
echo ""

# Run verification for each contract
SPECS=(
    "ExecutionAgent"
    "IntentCaptureModule"
    "LexiconHolder"
    "SunsetProtocol"
)

for spec in "${SPECS[@]}"; do
    echo "================================================"
    echo "Verifying: $spec"
    echo "================================================"

    if [ -f "certora/conf/${spec}.conf" ]; then
        certoraRun certora/conf/${spec}.conf
    else
        echo "Warning: No config found for $spec, skipping..."
    fi

    echo ""
done

echo "================================================"
echo "Verification Complete"
echo "================================================"
echo ""
echo "View results at: https://prover.certora.com/"
