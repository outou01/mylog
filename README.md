# AI Life Console

生活ログを記録し、AIがRPG風にステータス分析するWebサービス。

## 起動方法

```bash
# 1. 環境変数設定（任意）
cp .env.example .env
# .envにOPENAI_API_KEYを記入するとAIコメントが有効になる

# 2. 起動
docker-compose up --build

# 3. アクセス
# フロントエンド: http://localhost:3000
# API:           http://localhost:8000
# Swagger:       http://localhost:8000/docs
```

## 技術構成

| レイヤー | 技術 |
|---|---|
| Frontend | React + Vite + TypeScript |
| Backend | Python FastAPI |
| DB | PostgreSQL 16 |
| ORM | SQLAlchemy 2.0 |
| AI | OpenAI API (gpt-4o-mini) |
| インフラ | Docker / docker-compose |

## API

| Method | Path | 説明 |
|---|---|---|
| POST | /daily-logs | ログ登録 |
| GET | /daily-logs | ログ一覧 |
| GET | /daily-logs/latest | 最新ログ |
| GET | /daily-logs/{id} | ログ詳細 |
| PATCH | /daily-logs/{id} | ログ更新 |
| POST | /ai-review/{id} | AIレビュー生成 |
