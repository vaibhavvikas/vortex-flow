use crate::common::ResolvedFileMetadata;
use crate::embl::EmblClient;
use crate::error::ProviderError;
use crate::ncbi::NcbiClient;

pub struct SequenceUrlResolver {
    embl_client: EmblClient,
    ncbi_client: NcbiClient,
}

impl SequenceUrlResolver {
    pub fn new(ncbi_api_key: Option<String>) -> Self {
        Self {
            embl_client: EmblClient::default_client(),
            ncbi_client: NcbiClient::new(ncbi_api_key),
        }
    }

    pub fn default_resolver() -> Self {
        Self::new(None)
    }

    /// Primary orchestration method to resolve download links for accessions by target format.
    pub async fn resolve_links(
        &self,
        accessions: &[String],
        target_format: &str, // "sra" | "fastq" | "fasta"
    ) -> Result<Vec<ResolvedFileMetadata>, ProviderError> {
        let clean_format = target_format.trim().to_lowercase();

        match clean_format.as_str() {
            "fastq" => {
                tracing::info!("Resolving FastQ links via EMBL ENA for {} accessions", accessions.len());
                self.embl_client.fetch_run_files(accessions, "fastq").await
            }
            "sra" => {
                tracing::info!("Resolving SRA links via NCBI S3 for {} accessions", accessions.len());
                self.ncbi_client.fetch_sra_links(accessions).await
            }
            "fasta" => {
                tracing::info!("Resolving FASTA links via NCBI for {} accessions", accessions.len());
                self.ncbi_client.fetch_fasta_links(accessions).await
            }
            _ => Err(ProviderError::Api(format!(
                "Unsupported download format '{}'. Allowed formats: fastq, sra, fasta",
                target_format
            ))),
        }
    }
}
