#!/bin/bash
#
# CI.AI 项目管理脚本
# 用法:
#   ./start.sh          启动所有服务（先杀旧进程 → 检测依赖 → 启动）
#   ./start.sh stop     仅杀掉所有相关进程
#   ./start.sh status   查看服务运行状态
#

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_PORT=5173
BACKEND_PORT=8000
LOG_DIR="$PROJECT_ROOT/.logs"

# ──────────────────────────── 颜色 ────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # 无颜色

info()    { echo -e "${BLUE}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ──────────────────────────── 杀进程 ────────────────────────────
kill_services() {
  info "正在停止所有 CI.AI 相关进程..."

  # 杀掉占用前端端口的进程
  local frontend_pids
  frontend_pids=$(lsof -ti :$FRONTEND_PORT 2>/dev/null || true)
  if [ -n "$frontend_pids" ]; then
    echo "$frontend_pids" | xargs kill -9 2>/dev/null || true
    success "已停止前端服务 (端口 $FRONTEND_PORT)"
  else
    info "前端服务未运行"
  fi

  # 杀掉占用后端端口的进程
  local backend_pids
  backend_pids=$(lsof -ti :$BACKEND_PORT 2>/dev/null || true)
  if [ -n "$backend_pids" ]; then
    echo "$backend_pids" | xargs kill -9 2>/dev/null || true
    success "已停止后端服务 (端口 $BACKEND_PORT)"
  else
    info "后端服务未运行"
  fi

  # 杀掉残留的 vite / uvicorn 进程
  pkill -f "vite.*$PROJECT_ROOT" 2>/dev/null && success "已清理残留 vite 进程" || true
  pkill -f "uvicorn.*app.main" 2>/dev/null && success "已清理残留 uvicorn 进程" || true

  echo ""
}

# ──────────────────────────── 检测依赖 ────────────────────────────
check_and_install_deps() {
  info "检测依赖项安装情况..."
  echo ""

  # ---- Node.js / npm ----
  if ! command -v node &>/dev/null; then
    error "未安装 Node.js，请先安装: https://nodejs.org/"
    exit 1
  fi
  success "Node.js $(node -v)"

  if ! command -v npm &>/dev/null; then
    error "未安装 npm"
    exit 1
  fi
  success "npm $(npm -v)"

  # ---- 前端依赖 ----
  if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    warn "前端依赖未安装，正在安装..."
    cd "$PROJECT_ROOT" && npm install
    success "前端依赖安装完成"
  else
    success "前端依赖已就绪"
  fi

  echo ""

  # ---- Python ----
  # 优先使用 Python 3.12 或 3.13（兼容性最佳），避免 3.14+（太新，许多 C 扩展不兼容）
  local python_cmd=""
  for candidate in python3.12 python3.13 python3.11; do
    if command -v "$candidate" &>/dev/null; then
      python_cmd="$candidate"
      break
    fi
  done

  # 如果没找到指定版本，检查 python3 是否 <= 3.13
  if [ -z "$python_cmd" ] && command -v python3 &>/dev/null; then
    local minor_ver
    minor_ver=$(python3 --version 2>&1 | awk '{print $2}' | cut -d. -f2)
    if [ "$minor_ver" -le 13 ] 2>/dev/null; then
      python_cmd="python3"
    else
      warn "系统 python3 版本 (3.$minor_ver) 过新，C 扩展可能不兼容"
    fi
  fi

  if [ -z "$python_cmd" ]; then
    error "未安装 Python 3.11-3.13，请先安装: brew install python@3.13"
    exit 1
  fi
  local python_version
  python_version=$($python_cmd --version 2>&1 | awk '{print $2}')
  success "$python_cmd $python_version"

  # ---- 虚拟环境 ----
  VENV_DIR="$PROJECT_ROOT/backend/.venv"
  if [ -d "$VENV_DIR" ]; then
    # 检查现有 venv 的 Python 版本是否匹配
    local venv_python_ver=""
    if [ -f "$VENV_DIR/bin/python" ]; then
      venv_python_ver=$("$VENV_DIR/bin/python" --version 2>&1 | awk '{print $2}' | cut -d. -f1,2)
    fi
    local target_ver
    target_ver=$(echo "$python_version" | cut -d. -f1,2)
    if [ "$venv_python_ver" != "$target_ver" ]; then
      warn "虚拟环境 Python 版本 ($venv_python_ver) 与目标 ($target_ver) 不匹配，重新创建..."
      rm -rf "$VENV_DIR"
    fi
  fi

  if [ ! -d "$VENV_DIR" ]; then
    warn "虚拟环境不存在，正在创建..."
    $python_cmd -m venv "$VENV_DIR"
    success "虚拟环境已创建: $VENV_DIR (Python $python_version)"
  fi

  # 激活虚拟环境
  source "$VENV_DIR/bin/activate"
  success "已激活虚拟环境 (Python $(python --version 2>&1 | awk '{print $2}'))"

  # ---- pip ----
  if ! python -m pip --version &>/dev/null; then
    error "虚拟环境中未安装 pip"
    exit 1
  fi
  success "pip $(python -m pip --version | awk '{print $2}')"

  # ---- 后端依赖 ----
  local missing_deps=false
  if [ -f "$PROJECT_ROOT/backend/requirements.txt" ]; then
    # 快速检查几个核心包
    for pkg in fastapi uvicorn sqlalchemy; do
      if ! python -c "import $pkg" &>/dev/null; then
        missing_deps=true
        break
      fi
    done

    if [ "$missing_deps" = true ]; then
      warn "后端依赖未完全安装，正在安装..."
      cd "$PROJECT_ROOT/backend" && python -m pip install -r requirements.txt -q
      success "后端依赖安装完成"
    else
      success "后端依赖已就绪"
    fi
  fi

  echo ""
}

# ──────────────────────────── 启动服务 ────────────────────────────
start_services() {
  mkdir -p "$LOG_DIR"

  info "启动后端服务 (FastAPI on :$BACKEND_PORT)..."
  cd "$PROJECT_ROOT/backend"
  # 确保使用虚拟环境中的 Python
  source "$PROJECT_ROOT/backend/.venv/bin/activate"
  nohup python -m uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT --reload \
    --reload-exclude '.venv' --reload-exclude '__pycache__' --reload-exclude '*.pyc' \
    > "$LOG_DIR/backend.log" 2>&1 &
  local backend_pid=$!
  echo "$backend_pid" > "$LOG_DIR/backend.pid"

  # 等待后端启动
  local retries=0
  while ! curl -s "http://localhost:$BACKEND_PORT/health" &>/dev/null; do
    retries=$((retries + 1))
    if [ $retries -gt 15 ]; then
      error "后端启动超时，请检查 $LOG_DIR/backend.log"
      exit 1
    fi
    sleep 1
  done
  success "后端服务已启动 (PID: $backend_pid)"

  echo ""

  info "启动前端服务 (Vite on :$FRONTEND_PORT)..."
  cd "$PROJECT_ROOT"
  nohup npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
  local frontend_pid=$!
  echo "$frontend_pid" > "$LOG_DIR/frontend.pid"

  # 等待前端启动
  retries=0
  while ! curl -s "http://localhost:$FRONTEND_PORT" &>/dev/null; do
    retries=$((retries + 1))
    if [ $retries -gt 15 ]; then
      error "前端启动超时，请检查 $LOG_DIR/frontend.log"
      exit 1
    fi
    sleep 1
  done
  success "前端服务已启动 (PID: $frontend_pid)"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  success "🚀 CI.AI 所有服务已启动！"
  echo ""
  info "  前端:  http://localhost:$FRONTEND_PORT"
  info "  后端:  http://localhost:$BACKEND_PORT"
  info "  API:   http://localhost:$BACKEND_PORT/docs"
  echo ""
  info "  日志目录: $LOG_DIR/"
  info "  停止服务: ./start.sh stop"
  info "  查看状态: ./start.sh status"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ──────────────────────────── 查看状态 ────────────────────────────
show_status() {
  echo ""
  info "CI.AI 服务状态:"
  echo ""

  if lsof -ti :$BACKEND_PORT &>/dev/null; then
    success "后端服务: 运行中 (端口 $BACKEND_PORT)"
  else
    warn "后端服务: 未运行"
  fi

  if lsof -ti :$FRONTEND_PORT &>/dev/null; then
    success "前端服务: 运行中 (端口 $FRONTEND_PORT)"
  else
    warn "前端服务: 未运行"
  fi

  echo ""
}

# ──────────────────────────── 主入口 ────────────────────────────
main() {
  echo ""
  echo "╔══════════════════════════════════════╗"
  echo "║       CI.AI 项目管理脚本             ║"
  echo "╚══════════════════════════════════════╝"
  echo ""

  case "${1:-start}" in
    stop)
      kill_services
      success "所有服务已停止"
      ;;
    status)
      show_status
      ;;
    start|"")
      kill_services
      check_and_install_deps
      start_services
      ;;
    *)
      echo "用法: $0 {start|stop|status}"
      exit 1
      ;;
  esac
}

main "$@"
