mod auth;
mod routes;
mod state;

use axum::{http::{header, HeaderValue, Method}, middleware};
use state::AppState;
use tower_http::cors::CorsLayer;
use vortexflow_logging::init_logging;

#[tokio::main]
async fn main() {
  init_logging();
  tracing::info!("Initializing VortexFlow Server v2.4 Architecture...");

  let state = AppState::new();

  let cors = CorsLayer::new()
    .allow_origin([
      HeaderValue::from_static("http://localhost:1420"),
      HeaderValue::from_static("http://127.0.0.1:1420"),
      HeaderValue::from_static("null"),
    ])
    .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::PUT, Method::OPTIONS])
    .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);

  let app = routes::create_router()
    .layer(cors)
    .layer(middleware::from_fn_with_state(state.clone(), auth::require_api_token))
    .with_state(state);

  let listener = tokio::net::TcpListener::bind("127.0.0.1:8080")
    .await
    .expect("Failed to bind localhost 127.0.0.1:8080");

  tracing::info!("VortexFlow Server listening on http://127.0.0.1:8080");
  axum::serve(listener, app).await.unwrap();
}
