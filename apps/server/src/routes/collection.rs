use crate::state::AppState;
use axum::{
  extract::{Path, State},
  http::StatusCode,
  response::IntoResponse,
  routing::{get, post},
  Json, Router,
};
use serde::Deserialize;
use vortexflow_providers::SraRecord;

#[derive(Deserialize)]
pub struct ResolveUrlsRequest {
  pub ids: Option<Vec<String>>,
  pub format: String,
}

pub fn collection_routes() -> Router<AppState> {
  Router::new()
    .route("/api/collection", get(get_collection_handler))
    .route("/api/collection/add", post(add_collection_handler))
    .route("/api/collection/remove", post(remove_collection_handler))
    .route("/api/collection/resolve-urls", post(resolve_urls_handler))
    .route("/api/collection/{id}/details", get(get_collection_details_handler))
}

async fn get_collection_handler(State(state): State<AppState>) -> impl IntoResponse {
  match state.collection_service.get_all_sra_records() {
    Ok(items) => {
      tracing::info!("API Request GET /api/collection - Returned {} items from SQLite", items.len());
      (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response()
    }
    Err(err) => {
      tracing::error!("Error querying collection items from SQLite: {:?}", err);
      (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response()
    }
  }
}

async fn add_collection_handler(
  State(state): State<AppState>,
  Json(body): Json<AddCollectionRequest>,
) -> impl IntoResponse {
  match state.collection_service.add_sra_records(body.records) {
    Ok(updated_count) => {
      tracing::info!(
        "API Request POST /api/collection/add - Staged records in SQLite. Total collection size: {}",
        updated_count
      );
      (
        StatusCode::OK,
        Json(serde_json::json!({ "success": true, "total_collection_count": updated_count })),
      )
        .into_response()
    }
    Err(err) => {
      tracing::error!("Error adding records to SQLite: {:?}", err);
      (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response()
    }
  }
}

async fn remove_collection_handler(
  State(state): State<AppState>,
  Json(body): Json<RemoveCollectionRequest>,
) -> impl IntoResponse {
  match state.collection_service.remove_records(&body.ids) {
    Ok(deleted_count) => {
      tracing::info!(
        "API Request POST /api/collection/remove - Removed {} records from SQLite",
        deleted_count
      );
      (
        StatusCode::OK,
        Json(serde_json::json!({ "success": true, "deleted_count": deleted_count })),
      )
        .into_response()
    }
    Err(err) => {
      tracing::error!("Error removing records from SQLite: {:?}", err);
      (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response()
    }
  }
}

#[derive(Deserialize)]
pub struct AddCollectionRequest {
  pub records: Vec<SraRecord>,
}

#[derive(Deserialize)]
pub struct RemoveCollectionRequest {
  pub ids: Vec<String>,
}

async fn resolve_urls_handler(
  State(state): State<AppState>,
  Json(body): Json<ResolveUrlsRequest>,
) -> impl IntoResponse {
  let all_records = match state.collection_service.get_all_sra_records() {
    Ok(recs) => recs,
    Err(err) => return (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
  };

  let target_records: Vec<_> = if let Some(ref target_ids) = body.ids {
    if target_ids.is_empty() {
      all_records
    } else {
      all_records.into_iter().filter(|r| target_ids.contains(&r.id) || target_ids.contains(&r.accession)).collect()
    }
  } else {
    all_records
  };

  let accessions: Vec<String> = target_records.iter().map(|r| r.accession.clone()).collect();

  tracing::info!(
    "API Request POST /api/collection/resolve-urls - Resolving {} format links for {} accessions",
    body.format,
    accessions.len()
  );

  match state.url_resolver.resolve_links(&accessions, &body.format).await {
    Ok(resolved_files) => {
      if let Err(err) = state.collection_service.save_resolved_files(&resolved_files) {
        tracing::error!("Error storing resolved file links in SQLite: {:?}", err);
        return (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response();
      }

      (
        StatusCode::OK,
        Json(serde_json::json!({
          "success": true,
          "format": body.format,
          "resolved_count": resolved_files.len(),
          "files": resolved_files
        })),
      )
        .into_response()
    }
    Err(err) => {
      tracing::error!("Error resolving links: {:?}", err);
      (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response()
    }
  }
}

async fn get_collection_details_handler(
  State(state): State<AppState>,
  Path(id): Path<String>,
) -> impl IntoResponse {
  match state.collection_service.get_dataset_details(&id) {
    Ok(Some(details)) => (StatusCode::OK, Json(details)).into_response(),
    Ok(None) => (StatusCode::NOT_FOUND, "Dataset not found").into_response(),
    Err(err) => {
      tracing::error!("Error querying dataset details for {}: {:?}", id, err);
      (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response()
    }
  }
}

