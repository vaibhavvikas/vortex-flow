use vortexflow_db::CollectionService;
use vortexflow_providers::SequenceUrlResolver;

#[tokio::test]
async fn test_resolve_urls_id_determinism_twice() {
    // Step 1: Initialize temporary database
    let temp_db_file = std::env::temp_dir().join(format!("test_vortexflow_{}.db", rand::random::<u64>()));
    let collection_service = CollectionService::new(temp_db_file.clone()).expect("Failed to initialize test CollectionService");

    // Step 2: Add parent dataset item SRR1448794 to SQLite
    let item_id = "46396211".to_string();
    let accession = "SRR1448794".to_string();

    let record = vortexflow_providers::SraRecord {
        id: item_id.clone(),
        accession: accession.clone(),
        title: "GSM1418976: ATAC-seq; Homo sapiens".to_string(),
        organism: "Homo sapiens".to_string(),
        platform: "ILLUMINA".to_string(),
        total_spots: "1000".to_string(),
        release_date: "".to_string(),
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

    collection_service
        .add_sra_records(vec![record])
        .expect("Failed to insert item into DB");

    let resolver = SequenceUrlResolver::default_resolver();

    // -------------------------------------------------------------
    // FIRST FETCH (Call 1)
    // -------------------------------------------------------------
    let first_resolved = resolver
        .resolve_links(&[accession.clone()], "sra")
        .await
        .expect("First resolution failed");
    assert!(!first_resolved.is_empty());

    collection_service
        .save_resolved_files(&first_resolved)
        .expect("First save_resolved_files failed");

    let first_tasks = collection_service
        .get_download_tasks()
        .expect("Failed to query tasks after 1st fetch");
    println!("First Tasks count: {}, tasks: {:?}", first_tasks.len(), first_tasks);
    let first_file_id = first_tasks[0].file_id.clone();
    println!("First Fetch file_id: {}", first_file_id);

    // -------------------------------------------------------------
    // SECOND FETCH (Call 2 - Same Accession)
    // -------------------------------------------------------------
    let second_resolved = resolver
        .resolve_links(&[accession.clone()], "sra")
        .await
        .expect("Second resolution failed");
    assert!(!second_resolved.is_empty());

    collection_service
        .save_resolved_files(&second_resolved)
        .expect("Second save_resolved_files failed");

    let second_tasks = collection_service
        .get_download_tasks()
        .expect("Failed to query tasks after 2nd fetch");

    let second_file_id = second_tasks[0].file_id.clone();
    println!("Second Fetch file_id: {}", second_file_id);

    // -------------------------------------------------------------
    // ASSERTIONS: IDs MUST BE IDENTICAL & NO DUPLICATE DB ROWS CREATED
    // -------------------------------------------------------------
    assert_eq!(
        first_file_id, second_file_id,
        "File IDs between 1st and 2nd fetch MUST be identical!"
    );

    assert_eq!(
        second_tasks.len(), 1,
        "SQLite should contain exactly 1 task, no duplicate rows created!"
    );

    // Cleanup temp db file
    let _ = std::fs::remove_file(temp_db_file);
}
