from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://mylog:mylog@db:5432/mylog"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    class Config:
        env_file = ".env"


settings = Settings()
