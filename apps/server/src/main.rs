mod routes;
mod state;

use axum::http::Method;
use state::AppState;
use tower_http::cors::{Any, CorsLayer};
use vortexflow_logging::init_logging;

#[tokio::main]
async fn main() {
  init_logging();
  tracing::info!("Initializing VortexFlow Server v2.4 Architecture...");

  let state = AppState::new();

  let cors = CorsLayer::new()
    .allow_origin(Any)
    .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
    .allow_headers(Any);

  let app = routes::create_router().layer(cors).with_state(state);

  let listener = tokio::net::TcpListener::bind("127.0.0.1:8080")
    .await
    .expect("Failed to bind localhost 127.0.0.1:8080");

  tracing::info!("VortexFlow Server listening on http://127.0.0.1:8080");
  axum::serve(listener, app).await.unwrap();
}
