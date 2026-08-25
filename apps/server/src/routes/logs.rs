use crate::state::AppState;
use axum::{
  response::{
    sse::{Event, KeepAlive, Sse},
    IntoResponse,
  },
  routing::get,
  Json, Router,
};
use futures_util::stream::Stream;
use std::convert::Infallible;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use vortexflow_logging::{get_buffered_logs, subscribe_logs};

pub fn logs_routes() -> Router<AppState> {
  Router::new()
    .route("/api/logs", get(get_logs_handler))
    .route("/api/logs/stream", get(logs_stream_handler))
}

async fn get_logs_handler() -> impl IntoResponse {
  Json(get_buffered_logs())
}

async fn logs_stream_handler() -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
  let rx = subscribe_logs();
  let stream = BroadcastStream::new(rx).filter_map(|res| match res {
    Ok(entry) => match serde_json::to_string(&entry) {
      Ok(json) => Some(Ok(Event::default().data(json))),
      Err(_) => None,
    },
    Err(_) => None,
  });

  Sse::new(stream).keep_alive(KeepAlive::default())
}
