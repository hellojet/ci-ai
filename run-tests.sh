#!/bin/bash
#
# CI.AI Playwright 端到端测试运行脚本
# 用法:
#   ./run-tests.sh              运行所有测试
#   ./run-tests.sh --headed     有头模式（打开浏览器）
#   ./run-tests.sh --grep T8    只运行包含 T8 的测试
#

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     CI.AI Playwright E2E Tests       ║"
echo "╚══════════════════════════════════════╝"
echo ""

# 检查服务是否运行
echo "检查服务状态..."
if ! curl -s http://localhost:5173 > /dev/null 2>&1; then
  echo "❌ 前端服务未运行，请先执行 ./start.sh"
  exit 1
fi

if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
  echo "❌ 后端服务未运行，请先执行 ./start.sh"
  exit 1
fi

echo "✅ 前端服务运行中 (端口 5173)"
echo "✅ 后端服务运行中 (端口 8000)"
echo ""

# 运行测试
echo "开始运行 Playwright 测试..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

npx playwright test "$@"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 测试完成！"
echo ""
echo "查看测试报告: npx playwright show-report"
