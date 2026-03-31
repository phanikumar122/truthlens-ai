from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    NEWS_API_KEY: str = "your_dummy_key"
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "truthlens_db"

    # AI Model identifiers
    CLASSIFIER_MODEL: str = "roberta-base-openai-detector"
    SIMILARITY_MODEL: str = "all-MiniLM-L6-v2"

    # WebSocket heartbeat interval (seconds)
    WS_HEARTBEAT_INTERVAL: int = 10

    model_config = {"env_file": ".env"}


settings = Settings()
