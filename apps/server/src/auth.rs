use crate::state::AppState;
use axum::{
    extract::{Request, State},
    http::{Method, StatusCode, header::AUTHORIZATION},
    middleware::Next,
    response::{IntoResponse, Response},
};

/// The desktop shell creates this token for its embedded server. Tokenless
/// access requires an explicit development-only environment opt-in.
pub async fn require_api_token(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    if request.method() == Method::OPTIONS {
        return next.run(request).await;
    }

    if state.api_token.is_none() {
        if state.allow_insecure_dev_auth {
            return next.run(request).await;
        }
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "VORTEXFLOW_API_TOKEN is required",
        )
            .into_response();
    }

    let expected = state.api_token.as_deref().expect("checked above");
    let from_header = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    if from_header == Some(expected) {
        return next.run(request).await;
    }

    (
        StatusCode::UNAUTHORIZED,
        "Missing or invalid VortexFlow API token",
    )
        .into_response()
}
