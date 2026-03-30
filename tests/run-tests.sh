#!/bin/bash
# ============================================================
# PerKont Test Runner
# ============================================================
# Kullanim:
#   chmod +x tests/run-tests.sh
#   ./tests/run-tests.sh [unit|integration|e2e|load|security|all]
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
TESTS_DIR="$PROJECT_DIR/tests"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[TEST]${NC} $1"; }
success() { echo -e "${GREEN}[PASS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; }

# ============================================================
# TEST ORTAMI KURULUMU
# ============================================================

setup_test_env() {
  log "Test ortami kontrol ediliyor..."

  # Docker services
  if command -v docker-compose &> /dev/null; then
    log "Docker test servisleri baslatiliyor..."
    docker-compose -f "$TESTS_DIR/docker-compose.test.yml" up -d
    sleep 5
    success "Docker servisleri calisyor"
  else
    warn "Docker Compose bulunamadi. Yerel servisler kullanilacak."
  fi

  # Backend dependencies
  if [ ! -d "$BACKEND_DIR/node_modules" ]; then
    log "Backend bagimliliklari yukleniyor..."
    cd "$BACKEND_DIR" && npm ci
  fi

  # Frontend dependencies
  if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    log "Frontend bagimliliklari yukleniyor..."
    cd "$FRONTEND_DIR" && npm ci
  fi
}

# ============================================================
# SEED DATA
# ============================================================

seed_data() {
  log "Test verisi yukleniyor (10K musteri, 500K ekipman)..."
  cd "$BACKEND_DIR"

  # Install faker if not present
  npm list @faker-js/faker 2>/dev/null || npm install --save-dev @faker-js/faker

  DB_HOST=localhost DB_PORT=3307 DB_USERNAME=perkont_test DB_PASSWORD=perkont_test_pass DB_DATABASE=perkont_test \
    npx ts-node "$TESTS_DIR/seed/seed-generator.ts"

  success "Test verisi yuklendi"
}

# ============================================================
# UNIT TESTS
# ============================================================

run_unit_tests() {
  log "Unit testler calistiriliyor..."
  cd "$BACKEND_DIR"
  npx jest --config jest.config.js --coverage --forceExit
  success "Unit testler tamamlandi"
}

# ============================================================
# INTEGRATION TESTS
# ============================================================

run_integration_tests() {
  log "Integration testler calistiriliyor..."
  cd "$BACKEND_DIR"

  # Auth tests
  log "  → Auth testleri..."
  npx jest --config "$TESTS_DIR/jest.integration.json" \
    "$TESTS_DIR/integration/auth.integration.spec.ts" --forceExit || fail "Auth testleri basarisiz"

  # State machine tests
  log "  → State machine testleri..."
  npx jest --config "$TESTS_DIR/jest.integration.json" \
    "$TESTS_DIR/state-machine/state-transitions.spec.ts" --forceExit || fail "State machine testleri basarisiz"

  # Validation tests
  log "  → Validation testleri..."
  npx jest --config "$TESTS_DIR/jest.integration.json" \
    "$TESTS_DIR/validation/validation-tests.spec.ts" --forceExit || fail "Validation testleri basarisiz"

  # Security tests
  log "  → Guvenlik testleri..."
  npx jest --config "$TESTS_DIR/jest.integration.json" \
    "$TESTS_DIR/security/security-tests.spec.ts" --forceExit || fail "Guvenlik testleri basarisiz"

  success "Integration testler tamamlandi"
}

# ============================================================
# E2E TESTS
# ============================================================

run_e2e_tests() {
  log "E2E testler calistiriliyor (Playwright)..."
  cd "$FRONTEND_DIR"

  # Install browsers if needed
  npx playwright install --with-deps chromium

  npx playwright test "$TESTS_DIR/e2e/full-workflow.e2e.ts" \
    --reporter=list,html

  success "E2E testler tamamlandi"
}

# ============================================================
# LOAD TESTS
# ============================================================

run_load_tests() {
  log "Yuk testleri calistiriliyor (k6 - 100 VU)..."

  if ! command -v k6 &> /dev/null; then
    warn "k6 bulunamadi. Yukleme: https://k6.io/docs/get-started/installation/"
    warn "  Windows: choco install k6"
    warn "  macOS:   brew install k6"
    warn "  Linux:   apt install k6"
    return 1
  fi

  k6 run \
    --out json="$TESTS_DIR/load/results.json" \
    "$TESTS_DIR/load/full-load-test.js"

  success "Yuk testleri tamamlandi. Sonuclar: tests/load/results.json"
}

# ============================================================
# SECURITY TESTS
# ============================================================

run_security_tests() {
  log "Guvenlik testleri calistiriliyor..."
  cd "$BACKEND_DIR"

  npx jest --config "$TESTS_DIR/jest.integration.json" \
    "$TESTS_DIR/security/security-tests.spec.ts" \
    --forceExit --verbose

  success "Guvenlik testleri tamamlandi"
}

# ============================================================
# PERFORMANCE SQL
# ============================================================

run_sql_analysis() {
  log "SQL performans analizi calistiriliyor..."

  if command -v mysql &> /dev/null; then
    mysql -h localhost -P 3307 -u perkont_test -pperkont_test_pass perkont_test \
      < "$TESTS_DIR/performance/explain-queries.sql" \
      > "$TESTS_DIR/performance/explain-results.txt" 2>&1

    success "SQL analizi tamamlandi. Sonuclar: tests/performance/explain-results.txt"
  else
    warn "mysql client bulunamadi. Manuel calistirin:"
    warn "  mysql -u root -p perkont_test < tests/performance/explain-queries.sql"
  fi
}

# ============================================================
# ALL TESTS
# ============================================================

run_all() {
  setup_test_env

  log "=================================================="
  log "PerKont - Tam Test Suite Basliyor"
  log "=================================================="

  run_unit_tests
  run_integration_tests
  run_e2e_tests
  run_load_tests
  run_sql_analysis

  echo ""
  success "=================================================="
  success "TUM TESTLER TAMAMLANDI"
  success "=================================================="
  echo ""
  log "Sonuclar:"
  log "  Unit + Integration: backend/coverage/"
  log "  E2E:                frontend/playwright-report/"
  log "  Load:               tests/load/results.json"
  log "  SQL:                tests/performance/explain-results.txt"
  echo ""
  log "Detayli rapor icin: tests/TEST-STRATEGY.md"
  log "Kritik bulgular:    tests/CRITICAL-FINDINGS.md"
  log "Checklistler:       tests/CHECKLISTS.md"
}

# ============================================================
# MAIN
# ============================================================

case "${1:-all}" in
  unit)        run_unit_tests ;;
  integration) run_integration_tests ;;
  e2e)         run_e2e_tests ;;
  load)        run_load_tests ;;
  security)    run_security_tests ;;
  seed)        seed_data ;;
  sql)         run_sql_analysis ;;
  setup)       setup_test_env ;;
  all)         run_all ;;
  *)
    echo "Kullanim: $0 [unit|integration|e2e|load|security|seed|sql|setup|all]"
    exit 1
    ;;
esac
