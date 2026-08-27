use std::path::PathBuf;
use vortexflow_downloader::chunk::ChunkDownloader;
use vortexflow_downloader::types::{DownloadMetaState, DownloadSegment};
use vortexflow_downloader::DownloadManager;

#[tokio::test]
async fn test_calculate_segments_boundary() {
    // 0 bytes or non-range -> 1 segment
    let segments = ChunkDownloader::calculate_segments(0, false);
    assert_eq!(segments.len(), 1);
    assert_eq!(segments[0].start, 0);
    assert_eq!(segments[0].end, 0);

    // 2MB -> 1 segment
    let segments = ChunkDownloader::calculate_segments(2 * 1024 * 1024, true);
    assert_eq!(segments.len(), 1);

    // 20MB -> 2 segments
    let segments = ChunkDownloader::calculate_segments(20 * 1024 * 1024, true);
    assert_eq!(segments.len(), 2);
    assert_eq!(segments[0].start, 0);
    assert_eq!(segments[1].end, 20 * 1024 * 1024 - 1);

    // 100MB -> 4 segments
    let segments = ChunkDownloader::calculate_segments(100 * 1024 * 1024, true);
    assert_eq!(segments.len(), 4);

    // 1GB -> 8 segments
    let segments = ChunkDownloader::calculate_segments(1024 * 1024 * 1024, true);
    assert_eq!(segments.len(), 8);
    assert_eq!(segments[0].start, 0);
    assert_eq!(segments[7].end, 1024 * 1024 * 1024 - 1);
}

#[tokio::test]
async fn test_staging_paths() {
    let dest = PathBuf::from("/tmp/downloads/sample.fastq.gz");
    let (staging, meta) = ChunkDownloader::get_staging_paths(&dest);
    assert_eq!(staging, PathBuf::from("/tmp/downloads/sample.fastq.gz.vfdownload"));
    assert_eq!(meta, PathBuf::from("/tmp/downloads/sample.fastq.gz.vfdownload.meta"));
}

#[tokio::test]
async fn test_meta_state_serialization() {
    let temp_dir = std::env::temp_dir().join("vf_test_meta");
    tokio::fs::create_dir_all(&temp_dir).await.unwrap();

    let meta_path = temp_dir.join("test_file.fastq.gz.vfdownload.meta");
    let state = DownloadMetaState {
        task_id: "task_123".to_string(),
        group_id: Some("SRR12345".to_string()),
        url: "https://example.com/test.fastq.gz".to_string(),
        etag: Some("\"etag123\"".to_string()),
        last_modified: None,
        total_bytes: 1000,
        supports_range: true,
        destination_path: temp_dir.join("test_file.fastq.gz"),
        staging_path: temp_dir.join("test_file.fastq.gz.vfdownload"),
        segments: vec![
            DownloadSegment {
                index: 0,
                start: 0,
                end: 499,
                downloaded_bytes: 500,
            },
            DownloadSegment {
                index: 1,
                start: 500,
                end: 999,
                downloaded_bytes: 250,
            },
        ],
        updated_at: chrono::Utc::now(),
    };

    ChunkDownloader::save_meta_state(&meta_path, &state).await.unwrap();
    let loaded = ChunkDownloader::load_meta_state(&meta_path).await.unwrap();

    assert_eq!(loaded.task_id, "task_123");
    assert_eq!(loaded.segments.len(), 2);
    assert!(loaded.segments[0].is_complete());
    assert!(!loaded.segments[1].is_complete());
    assert_eq!(loaded.segments[1].current_offset(), 750);

    let _ = tokio::fs::remove_dir_all(&temp_dir).await;
}

#[tokio::test]
async fn test_manager_lifecycle_init() {
    let manager = DownloadManager::new();
    let mut rx = manager.subscribe_events();

    let dest = std::env::temp_dir().join("test_init.bin");
    let descriptor = vortexflow_downloader::DownloadTaskDescriptor {
        id: "task_init_1".to_string(),
        group_id: None,
        url: "https://httpbin.org/bytes/1024".to_string(),
        destination_path: dest,
        temp_dir: std::env::temp_dir(),
        expected_size_bytes: 1024,
        priority: 1,
    };

    let res = manager.submit_task(descriptor).await;
    assert!(res.is_ok());

    let event = rx.recv().await.unwrap();
    match event {
        vortexflow_downloader::DownloadEvent::TaskSubmitted(id) => {
            assert_eq!(id, "task_init_1");
        }
        _ => panic!("Expected TaskSubmitted"),
    }
}
