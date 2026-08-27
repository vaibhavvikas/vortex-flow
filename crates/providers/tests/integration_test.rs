use vortexflow_providers::{NcbiClient, SequenceUrlResolver};

#[tokio::test]
async fn test_srp043510_search_and_url_resolution() {
    let ncbi_client = NcbiClient::default_client();

    // Step 1: Search for SRP043510 in SRA
    let search_res = ncbi_client
        .search_sra("SRP043510", "sra", 1, 10)
        .await
        .expect("Failed to search SRP043510 on NCBI");

    assert!(
        !search_res.records.is_empty(),
        "Expected at least 1 record for search query SRP043510"
    );

    let first_record = &search_res.records[0];
    let accession = &first_record.accession;
    println!("Found accession: {} ({})", accession, first_record.title);

    let resolver = SequenceUrlResolver::default_resolver();
    let accessions = vec![accession.clone()];

    // Step 2: Resolve FASTA URL
    let fasta_files = resolver
        .resolve_links(&accessions, "fasta")
        .await
        .expect("Failed to resolve FASTA link");
    assert!(
        !fasta_files.is_empty(),
        "FASTA resolution returned empty list for accession {}",
        accession
    );
    assert!(
        fasta_files[0].download_url.starts_with("http"),
        "FASTA URL is invalid: {}",
        fasta_files[0].download_url
    );
    println!("FASTA URL: {}", fasta_files[0].download_url);

    // Step 3: Resolve SRA URL
    let sra_files = resolver
        .resolve_links(&accessions, "sra")
        .await
        .expect("Failed to resolve SRA link");
    assert!(
        !sra_files.is_empty(),
        "SRA resolution returned empty list for accession {}",
        accession
    );
    assert!(
        sra_files[0].download_url.starts_with("http"),
        "SRA URL is invalid: {}",
        sra_files[0].download_url
    );
    println!("SRA URL: {}", sra_files[0].download_url);

    // Step 4: Resolve FastQ URL
    let fastq_files = resolver
        .resolve_links(&accessions, "fastq")
        .await
        .expect("Failed to resolve FastQ link");
    assert!(
        !fastq_files.is_empty(),
        "FastQ resolution returned empty list for accession {}",
        accession
    );
    assert!(
        fastq_files[0].download_url.starts_with("http"),
        "FastQ URL is invalid: {}",
        fastq_files[0].download_url
    );
    println!("FastQ URL: {}", fastq_files[0].download_url);
}
