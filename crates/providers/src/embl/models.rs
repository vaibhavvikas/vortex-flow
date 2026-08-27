use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnaFileReportRecord {
    pub run_accession: Option<String>,
    pub experiment_accession: Option<String>,
    pub sample_accession: Option<String>,
    pub fastq_ftp: Option<String>,
    pub fastq_bytes: Option<String>,
    pub fastq_md5: Option<String>,
    pub fastq_aws: Option<String>,
    pub fastq_gcp: Option<String>,
    pub sra_ftp: Option<String>,
    pub sra_bytes: Option<String>,
    pub sra_md5: Option<String>,
    pub sra_aws: Option<String>,
    pub sra_gcp: Option<String>,
    pub scientific_name: Option<String>,
    pub library_strategy: Option<String>,
    pub library_layout: Option<String>,
}
