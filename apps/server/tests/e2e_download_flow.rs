use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use serde_json::{json, Value};
use tower::ServiceExt;
use vortexflow_providers::SraRecord;
use vortexflow_server::{routes, state::AppState};

#[tokio::test]
async fn test_e2e_srr1448794_download_flow() {
    let state = AppState::new();
    let app = routes::create_router().with_state(state);

    // Step 1: Add accession SRR1448794 to Collection via POST /api/collection/add
    let record = SraRecord {
        id: "46396211".to_string(),
        accession: "SRR1448794".to_string(),
        title: "GSM1418976: ATAC-seq (Nutlin-3a); Homo sapiens; OTHER".to_string(),
        organism: "Homo sapiens".to_string(),
        platform: "ILLUMINA".to_string(),
        total_spots: "1000".to_string(),
        release_date: "2014-06-01".to_string(),
        study_id: "SRP043510".to_string(),
        instrument_model: None,
        library_strategy: None,
        library_source: None,
        library_selection: None,
        library_layout: None,
        total_runs: None,
        total_bases: None,
        total_size: None,
        submitter_acc: None,
        center_name: None,
        experiment_acc: None,
        bioproject: None,
        biosample: None,
        sample_acc: None,
        construction_protocol: None,
        cell_line: None,
        source_name: None,
        treatment: None,
        antibody: None,
        expxml: None,
        is_downloaded: Some(false),
        status: Some("saved".to_string()),
    };

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/collection/add")
                .header("content-type", "application/json")
                .body(Body::from(json!({ "records": [record] }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    if status != StatusCode::OK {
        println!("Add collection error: {:?}", String::from_utf8_lossy(&body_bytes));
    }
    assert_eq!(status, StatusCode::OK);

    // Step 2: Verify item in GET /api/collection
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/collection")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let items: Vec<Value> = serde_json::from_slice(&body_bytes).unwrap();
    assert!(!items.is_empty(), "Collection should contain at least 1 item");
    println!("Collection items count: {}", items.len());

    // Step 3: Resolve SRA URLs for accession SRR1448794 via POST /api/collection/resolve-urls
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/collection/resolve-urls")
                .header("content-type", "application/json")
                .body(Body::from(json!({ "format": "sra", "ids": ["SRR1448794"] }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let resolve_res: Value = serde_json::from_slice(&body_bytes).unwrap();
    println!("Resolve response: {:?}", resolve_res);
    assert_eq!(resolve_res["success"], true);
    assert!(resolve_res["resolved_count"].as_u64().unwrap_or(0) >= 1);

    // Step 4: Enqueue download for SRA format via POST /api/downloads/start
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/downloads/start")
                .header("content-type", "application/json")
                .body(Body::from(json!({ "format": "sra" }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    if status != StatusCode::OK {
        println!("Start downloads error: {:?}", String::from_utf8_lossy(&body_bytes));
    }
    assert_eq!(status, StatusCode::OK);
    let start_res: Value = serde_json::from_slice(&body_bytes).unwrap();
    println!("Start downloads response: {:?}", start_res);
    assert_eq!(start_res["success"], true);
    assert!(start_res["enqueued_count"].as_u64().unwrap_or(0) >= 1);

    // Step 5: Verify task status in GET /api/downloads
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/downloads")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let downloads: Vec<Value> = serde_json::from_slice(&body_bytes).unwrap();
    assert!(!downloads.is_empty(), "Downloads should contain at least 1 task");
    let file_id = downloads[0]["file_id"].as_str().unwrap().to_string();
    println!("Found download task file_id: {}", file_id);

    // Step 6: Delete task via DELETE /api/downloads/{file_id}
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/api/downloads/{}", file_id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Step 7: Verify task is completely removed from GET /api/downloads
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/downloads")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let remaining_downloads: Vec<Value> = serde_json::from_slice(&body_bytes).unwrap();
    let matching = remaining_downloads
        .iter()
        .any(|d| d["file_id"] == file_id);
    assert!(!matching, "Deleted task should not exist in downloads list");
}
