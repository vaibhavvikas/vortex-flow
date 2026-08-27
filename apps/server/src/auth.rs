use crate::state::AppState;
use axum::{
  extract::{Request, State},
  http::{header::AUTHORIZATION, Method, StatusCode},
  middleware::Next,
  response::{IntoResponse, Response},
};

/// The desktop shell creates this token for its embedded server. Development
/// remains tokenless so the independently started API is convenient to use.
pub async fn require_api_token(
  State(state): State<AppState>,
  request: Request,
  next: Next,
) -> Response {
  if request.method() == Method::OPTIONS || state.api_token.is_none() {
    return next.run(request).await;
  }

  let expected = state.api_token.as_deref().expect("checked above");
  let from_header = request
    .headers()
    .get(AUTHORIZATION)
    .and_then(|value| value.to_str().ok())
    .and_then(|value| value.strip_prefix("Bearer "));
  let from_query = request.uri().query().and_then(|query| {
    query.split('&').find_map(|part| part.strip_prefix("token="))
  });

  if from_header.or(from_query) == Some(expected) {
    return next.run(request).await;
  }

  (StatusCode::UNAUTHORIZED, "Missing or invalid VortexFlow API token").into_response()
}
