use vortexflow_providers::SequenceUrlResolver;

#[tokio::test]
async fn test_all_resolve_urls_provider_apis_srr1448794() {
    let resolver = SequenceUrlResolver::default_resolver();
    let accessions = vec!["SRR1448794".to_string()];
    let client = reqwest::Client::new();

    // -------------------------------------------------------------
    // Test 1: FASTA URL Resolution (NCBI Entrez EFetch API)
    // -------------------------------------------------------------
    println!("--- Testing FASTA resolution ---");
    let fasta_results = resolver
        .resolve_links(&accessions, "fasta")
        .await
        .expect("FASTA url resolution failed");

    assert!(!fasta_results.is_empty(), "FASTA results should not be empty");
    let fasta_url = &fasta_results[0].download_url;
    println!("Resolved FASTA URL: {}", fasta_url);

    // Verify HTTP endpoint reaches NCBI successfully
    let fasta_res = client
        .get(fasta_url)
        .header("User-Agent", "VortexFlow-Test/2.4")
        .send()
        .await
        .expect("Failed to send request to FASTA URL");

    assert_eq!(
        fasta_res.status(),
        reqwest::StatusCode::OK,
        "FASTA URL returned non-200 status code: {}",
        fasta_res.status()
    );

    // -------------------------------------------------------------
    // Test 2: SRA URL Resolution (AWS S3 Open Data / EMBL ENA)
    // -------------------------------------------------------------
    println!("--- Testing SRA resolution ---");
    let sra_results = resolver
        .resolve_links(&accessions, "sra")
        .await
        .expect("SRA url resolution failed");

    assert!(!sra_results.is_empty(), "SRA results should not be empty");
    let sra_url = &sra_results[0].download_url;
    println!("Resolved SRA URL: {}", sra_url);

    // Verify HTTP endpoint reaches AWS S3/ENA successfully via HEAD/GET range
    let sra_res = client
        .get(sra_url)
        .header(reqwest::header::RANGE, "bytes=0-100")
        .send()
        .await
        .expect("Failed to send request to SRA URL");

    assert!(
        sra_res.status().is_success(),
        "SRA URL returned non-success status code: {}",
        sra_res.status()
    );

    // -------------------------------------------------------------
    // Test 3: FastQ URL Resolution (EMBL ENA Filereport API)
    // -------------------------------------------------------------
    println!("--- Testing FastQ resolution ---");
    let fastq_results = resolver
        .resolve_links(&accessions, "fastq")
        .await
        .expect("FastQ url resolution failed");

    assert!(!fastq_results.is_empty(), "FastQ results should not be empty");
    let fastq_url = &fastq_results[0].download_url;
    println!("Resolved FastQ URL: {}", fastq_url);

    // Verify HTTP endpoint reaches ENA FastQ FTP/HTTPS mirror successfully
    let fastq_res = client
        .get(fastq_url)
        .header(reqwest::header::RANGE, "bytes=0-100")
        .send()
        .await
        .expect("Failed to send request to FastQ URL");

    assert!(
        fastq_res.status().is_success(),
        "FastQ URL returned non-success status code: {}",
        fastq_res.status()
    );
}
