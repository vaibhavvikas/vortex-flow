use crate::state::AppState;
use axum::{
  extract::State,
  response::IntoResponse,
  routing::{get, post},
  Json, Router,
};
use serde::Deserialize;
use vortexflow_providers::SraRecord;

#[derive(Deserialize)]
pub struct AddCollectionRequest {
  pub records: Vec<SraRecord>,
}

pub fn collection_routes() -> Router<AppState> {
  Router::new()
    .route("/api/collection", get(get_collection_handler))
    .route("/api/collection/add", post(add_collection_handler))
}

async fn get_collection_handler(State(state): State<AppState>) -> impl IntoResponse {
  let items = state.collection.lock().unwrap().clone();
  tracing::info!("API Request GET /api/collection - Returned {} items", items.len());
  Json(items)
}

async fn add_collection_handler(
  State(state): State<AppState>,
  Json(body): Json<AddCollectionRequest>,
) -> impl IntoResponse {
  let mut lock = state.collection.lock().unwrap();
  for record in body.records {
    if !lock.iter().any(|r| r.id == record.id) {
      lock.push(record);
    }
  }
  let updated_count = lock.len();
  tracing::info!(
    "API Request POST /api/collection/add - Staged records. Total collection size: {}",
    updated_count
  );
  Json(serde_json::json!({ "success": true, "total_collection_count": updated_count }))
}
