# task-branch — developer tasks
# 使い方: `make help`

WEB := web
SKILL_SRC := plan-skill/SKILL.md
SKILL_DST := .claude/skills/plan
SIGNING_KEYS := supabase/signing_keys.json

.DEFAULT_GOAL := help

.PHONY: help setup install-cli signing-key up down reset status web-install env dev mcp-dev build preview skill clean

help: ## このヘルプを表示
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

setup: env signing-key web-install skill ## 初期セットアップ（.env作成 + 署名鍵生成 + 依存導入 + スキル配置）
	@echo "✅ setup 完了。'make up' で Supabase を起動し、'make dev' でフロントを起動してください。"

## --- Supabase (ローカル / Docker) ---
install-cli: ## Supabase CLI を Homebrew で導入
	brew install supabase/tap/supabase

signing-key: $(SIGNING_KEYS) ## JWT 署名鍵（ES256）を生成（既存は保持）

$(SIGNING_KEYS):
	echo "[]" > $@
	supabase gen signing-key --algorithm ES256 --append

up: ## ローカル Supabase を起動（migrations 適用 + seed 投入）
	supabase start

down: ## ローカル Supabase を停止
	supabase stop

reset: ## DB をリセットして migrations/seed を再適用
	supabase db reset

status: ## ローカル Supabase の状態と接続情報を表示
	supabase status

## --- フロントエンド ---
env: ## web/.env を .env.example から作成（既存は保持）
	@cd $(WEB) && [ -f .env ] || cp .env.example .env
	@echo "web/.env を確認し、'make up' が表示する URL / anon key を設定してください。"

web-install: ## フロントの依存をインストール
	cd $(WEB) && npm install

dev: ## フロント開発サーバを起動（http://localhost:5173）
	cd $(WEB) && npm run dev

mcp-dev: ## Vercel の関数（/api）とフロントを一緒に起動（http://localhost:3000）
	vercel dev --listen 3000

build: ## フロントを型チェック + 本番ビルド
	cd $(WEB) && npm run build

preview: ## ビルド結果をプレビュー
	cd $(WEB) && npm run preview

## --- plan スキル ---
skill: ## plan スキルを .claude/skills/plan へ配置
	@mkdir -p $(SKILL_DST)
	@cp $(SKILL_SRC) $(SKILL_DST)/SKILL.md
	@echo "✅ $(SKILL_DST)/SKILL.md を配置しました。"

## --- その他 ---
clean: ## node_modules / ビルド成果物を削除
	rm -rf $(WEB)/node_modules $(WEB)/dist
