#!/bin/bash

# Circuit Build Script
# ====================
# This script compiles Circom circuits and generates verification keys.
#
# Prerequisites:
#   - circom >= 2.1.6
#   - snarkjs
#   - Node.js
#
# Usage:
#   ./build_circuits.sh [circuit_name]
#
# Examples:
#   ./build_circuits.sh                    # Build all circuits
#   ./build_circuits.sh death_certificate  # Build only death certificate circuit

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CIRCUITS_DIR="$PROJECT_ROOT/circuits"
BUILD_DIR="$CIRCUITS_DIR/build"
PTAU_FILE="$BUILD_DIR/powersOfTau28_hez_final_16.ptau"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check dependencies
check_dependencies() {
    log_info "Checking dependencies..."

    if ! command -v circom &> /dev/null; then
        log_error "circom not found. Install with: cargo install circom"
        exit 1
    fi

    if ! command -v snarkjs &> /dev/null; then
        log_error "snarkjs not found. Install with: npm install -g snarkjs"
        exit 1
    fi

    log_info "Dependencies OK"
}

# Download Powers of Tau file
download_ptau() {
    if [ -f "$PTAU_FILE" ]; then
        log_info "Powers of Tau file already exists"
        return
    fi

    log_info "Downloading Powers of Tau file (this may take a while)..."
    mkdir -p "$BUILD_DIR"

    # Use Hermez ceremony file (16 powers = 2^16 constraints max)
    curl -L -o "$PTAU_FILE" \
        "https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_16.ptau"

    log_info "Powers of Tau downloaded"
}

# Build a single circuit
build_circuit() {
    local CIRCUIT_NAME=$1
    local CIRCUIT_FILE=$2

    log_info "Building circuit: $CIRCUIT_NAME"

    local CIRCUIT_DIR="$BUILD_DIR/$CIRCUIT_NAME"
    mkdir -p "$CIRCUIT_DIR"

    # Step 1: Compile circuit
    log_info "  Compiling circuit..."
    circom "$CIRCUIT_FILE" \
        --r1cs \
        --wasm \
        --sym \
        -o "$CIRCUIT_DIR" \
        -l "$PROJECT_ROOT/node_modules"

    # Step 2: Generate witness generation files (already done by --wasm)

    # Step 3: Setup (Groth16)
    log_info "  Running trusted setup (Groth16)..."

    # Generate zkey
    snarkjs groth16 setup \
        "$CIRCUIT_DIR/${CIRCUIT_NAME}.r1cs" \
        "$PTAU_FILE" \
        "$CIRCUIT_DIR/${CIRCUIT_NAME}_0000.zkey"

    # Contribute to ceremony (single contribution for testing)
    snarkjs zkey contribute \
        "$CIRCUIT_DIR/${CIRCUIT_NAME}_0000.zkey" \
        "$CIRCUIT_DIR/${CIRCUIT_NAME}_final.zkey" \
        --name="FIE Build" \
        -v -e="random entropy $(date +%s)"

    # Export verification key
    snarkjs zkey export verificationkey \
        "$CIRCUIT_DIR/${CIRCUIT_NAME}_final.zkey" \
        "$CIRCUIT_DIR/verification_key.json"

    # Generate Solidity verifier
    log_info "  Generating Solidity verifier..."
    snarkjs zkey export solidityverifier \
        "$CIRCUIT_DIR/${CIRCUIT_NAME}_final.zkey" \
        "$CIRCUIT_DIR/${CIRCUIT_NAME}_verifier.sol"

    # Generate sample input template
    log_info "  Generating input template..."
    snarkjs r1cs info "$CIRCUIT_DIR/${CIRCUIT_NAME}.r1cs" > "$CIRCUIT_DIR/circuit_info.txt"

    log_info "  Circuit $CIRCUIT_NAME built successfully!"
    echo ""
}

# Main build function
build_all() {
    log_info "Starting circuit build process..."
    echo ""

    # Create build directory
    mkdir -p "$BUILD_DIR"

    # Download PTAU if needed
    download_ptau

    # Build death certificate circuit
    build_circuit "death_certificate" "$CIRCUITS_DIR/certificate_verifier.circom"

    # Build medical certificate circuit
    build_circuit "medical_certificate" "$CIRCUITS_DIR/medical_verifier.circom"

    # Build legal document circuit
    build_circuit "legal_document" "$CIRCUITS_DIR/legal_verifier.circom"

    log_info "All circuits built successfully!"
    echo ""
    log_info "Build artifacts in: $BUILD_DIR"
    echo ""
    echo "Generated files per circuit:"
    echo "  - <name>.r1cs          : Circuit constraints"
    echo "  - <name>_js/           : WASM witness generator"
    echo "  - <name>_final.zkey    : Proving key"
    echo "  - verification_key.json: Verification key"
    echo "  - <name>_verifier.sol  : Solidity verifier contract"
}

# Build single circuit
build_single() {
    local CIRCUIT_NAME=$1

    case $CIRCUIT_NAME in
        "death_certificate")
            download_ptau
            build_circuit "death_certificate" "$CIRCUITS_DIR/certificate_verifier.circom"
            ;;
        "medical_certificate")
            download_ptau
            build_circuit "medical_certificate" "$CIRCUITS_DIR/medical_verifier.circom"
            ;;
        "legal_document")
            download_ptau
            build_circuit "legal_document" "$CIRCUITS_DIR/legal_verifier.circom"
            ;;
        *)
            log_error "Unknown circuit: $CIRCUIT_NAME"
            echo "Available circuits:"
            echo "  - death_certificate"
            echo "  - medical_certificate"
            echo "  - legal_document"
            exit 1
            ;;
    esac
}

# Parse arguments and run
main() {
    check_dependencies

    if [ -z "$1" ]; then
        build_all
    else
        build_single "$1"
    fi
}

main "$@"
