use crate::state::AppState;
use axum::{
  extract::{Query, State},
  http::StatusCode,
  response::IntoResponse,
  routing::get,
  Json, Router,
};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct SearchQueryParams {
  pub term: Option<String>,
  pub db: Option<String>,
  pub page: Option<usize>,
  pub retmax: Option<usize>,
}

pub fn ncbi_routes() -> Router<AppState> {
  Router::new().route("/api/search/sra", get(search_sra_handler))
}

async fn search_sra_handler(
  State(state): State<AppState>,
  Query(params): Query<SearchQueryParams>,
) -> impl IntoResponse {
  let term = params.term.unwrap_or_default();
  let db = params.db.unwrap_or_else(|| "sra".to_string());
  let page = params.page.unwrap_or(1);
  let retmax = params.retmax.unwrap_or(100);

  tracing::info!(
    "API Request GET /api/search/sra - Query: '{}', DB: '{}', Page: {}",
    term,
    db,
    page
  );

  match state.ncbi_client.search_sra(&term, &db, page, retmax).await {
    Ok(res) => Json(res).into_response(),
    Err(err) => {
      tracing::error!("API Error in Entrez search for '{}' (db: {}): {}", term, db, err);
      (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({ "error": err.to_string() })),
      )
        .into_response()
    }
  }
}
