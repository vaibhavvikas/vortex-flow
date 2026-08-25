use crate::state::AppState;
use axum::{routing::get, Json, Router};

pub fn health_routes() -> Router<AppState> {
  Router::new().route("/api/health", get(health_handler))
}

async fn health_handler() -> Json<serde_json::Value> {
  Json(serde_json::json!({ "status": "ok", "server": "VortexFlow Server v2.4" }))
}
