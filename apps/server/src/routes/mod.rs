pub mod collection;
pub mod download;
pub mod health;
pub mod logs;
pub mod manifests;
pub mod ncbi;
pub mod workflow;

use crate::state::AppState;
use axum::Router;

pub fn create_router() -> Router<AppState> {
  Router::new()
    .merge(health::health_routes())
    .merge(ncbi::ncbi_routes())
    .merge(collection::collection_routes())
    .merge(download::download_routes())
    .merge(logs::logs_routes())
    .merge(workflow::workflow_routes())
    .merge(manifests::manifest_routes())
}
