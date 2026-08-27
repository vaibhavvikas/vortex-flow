use crate::common::{RequestRateLimiter, ResolvedFileMetadata};
use crate::embl::models::EnaFileReportRecord;
use crate::error::ProviderError;
use reqwest::Client;

pub const ENA_FILEREPORT_URL: &str = "https://www.ebi.ac.uk/ena/portal/api/filereport";

pub struct EmblClient {
    client: Client,
    rate_limiter: RequestRateLimiter,
}

impl EmblClient {
    pub fn new(rate_limiter: RequestRateLimiter) -> Self {
        let client = Client::builder()
            .user_agent("NGS-Toolkit-EMBL-Client/1.0")
            .build()
            .unwrap_or_default();

        Self { client, rate_limiter }
    }

    pub fn default_client() -> Self {
        Self::new(RequestRateLimiter::default_public())
    }

    /// Fetch FASTQ or SRA file links from EMBL ENA Filereport for a batch of accessions.
    pub async fn fetch_run_files(
        &self,
        accessions: &[String],
        target_format: &str, // "fastq" or "sra"
    ) -> Result<Vec<ResolvedFileMetadata>, ProviderError> {
        if accessions.is_empty() {
            return Ok(Vec::new());
        }

        let mut results = Vec::new();
        // Batch accessions in chunks of 50 to respect URL length and API limits
        for chunk in accessions.chunks(50) {
            self.rate_limiter.wait().await;

            let acc_str = chunk.join(",");
            let fields = "run_accession,fastq_ftp,fastq_bytes,fastq_md5,sra_ftp,sra_bytes,sra_md5,scientific_name,library_strategy,library_layout";

            let url = format!(
                "{}?accession={}&result=read_run&fields={}&format=json",
                ENA_FILEREPORT_URL,
                acc_str,
                fields
            );

            tracing::info!("Querying EMBL ENA Filereport API for {} accessions: {}", chunk.len(), url);

            let response = self.client.get(&url).send().await?;
            if !response.status().is_success() {
                tracing::warn!("EMBL ENA returned non-success status: {}", response.status());
                continue;
            }

            let records: Vec<EnaFileReportRecord> = match response.json().await {
                Ok(recs) => recs,
                Err(err) => {
                    tracing::warn!("Failed to parse ENA Filereport JSON response: {:?}", err);
                    Vec::new()
                }
            };

            for rec in records {
                if let Some(ref run_acc) = rec.run_accession {
                    let files = self.extract_files_for_record(run_acc, &rec, target_format);
                    results.extend(files);
                }
            }
        }

        Ok(results)
    }

    fn extract_files_for_record(
        &self,
        run_acc: &str,
        rec: &EnaFileReportRecord,
        target_format: &str,
    ) -> Vec<ResolvedFileMetadata> {
        let mut resolved = Vec::new();

        if target_format == "fastq" {
            // ENA provides semicolon-delimited lists for multi-file runs (e.g. paired-end _1.fastq.gz; _2.fastq.gz)
            let aws_urls: Vec<&str> = rec.fastq_aws.as_deref().unwrap_or("").split(';').filter(|s| !s.is_empty()).collect();
            let gcp_urls: Vec<&str> = rec.fastq_gcp.as_deref().unwrap_or("").split(';').filter(|s| !s.is_empty()).collect();
            let ftp_urls: Vec<&str> = rec.fastq_ftp.as_deref().unwrap_or("").split(';').filter(|s| !s.is_empty()).collect();
            let bytes_list: Vec<&str> = rec.fastq_bytes.as_deref().unwrap_or("").split(';').filter(|s| !s.is_empty()).collect();
            let md5_list: Vec<&str> = rec.fastq_md5.as_deref().unwrap_or("").split(';').filter(|s| !s.is_empty()).collect();

            let file_count = ftp_urls.len().max(aws_urls.len()).max(gcp_urls.len());
            for idx in 0..file_count {
                let (url, mirror_type) = self.select_url(
                    aws_urls.get(idx).copied(),
                    gcp_urls.get(idx).copied(),
                    ftp_urls.get(idx).copied(),
                );

                if url.is_empty() {
                    continue;
                }

                let file_name = if file_count > 1 {
                    format!("{}_{}.fastq.gz", run_acc, idx + 1)
                } else {
                    format!("{}.fastq.gz", run_acc)
                };

                let file_size_bytes = bytes_list
                    .get(idx)
                    .and_then(|b| b.parse::<u64>().ok())
                    .unwrap_or(0);

                let md5_checksum = md5_list.get(idx).map(|s| s.to_string());

                resolved.push(ResolvedFileMetadata {
                    item_id: run_acc.to_string(),
                    accession: run_acc.to_string(),
                    file_name,
                    format: "fastq".to_string(),
                    read_pair: (idx + 1) as u8,
                    download_url: url,
                    mirror_type,
                    file_size_bytes,
                    md5_checksum,
                    sha256_checksum: None,
                });
            }
        } else if target_format == "sra" {
            let (url, mirror_type) = self.select_url(
                rec.sra_aws.as_deref(),
                rec.sra_gcp.as_deref(),
                rec.sra_ftp.as_deref(),
            );

            if !url.is_empty() {
                let file_size_bytes = rec
                    .sra_bytes
                    .as_deref()
                    .and_then(|b| b.parse::<u64>().ok())
                    .unwrap_or(0);

                resolved.push(ResolvedFileMetadata {
                    item_id: run_acc.to_string(),
                    accession: run_acc.to_string(),
                    file_name: format!("{}.sra", run_acc),
                    format: "sra".to_string(),
                    read_pair: 1,
                    download_url: url,
                    mirror_type,
                    file_size_bytes,
                    md5_checksum: rec.sra_md5.clone(),
                    sha256_checksum: None,
                });
            }
        }

        resolved
    }

    /// Select high-speed cloud mirror URL (AWS S3 > GCP Cloud > HTTPS ENA), normalizing FTP to HTTPS.
    fn select_url(
        &self,
        aws_url: Option<&str>,
        gcp_url: Option<&str>,
        ftp_url: Option<&str>,
    ) -> (String, String) {
        if let Some(aws) = aws_url {
            if !aws.trim().is_empty() {
                return (self.normalize_url(aws), "aws_s3".to_string());
            }
        }

        if let Some(gcp) = gcp_url {
            if !gcp.trim().is_empty() {
                return (self.normalize_url(gcp), "gcp".to_string());
            }
        }

        if let Some(ftp) = ftp_url {
            if !ftp.trim().is_empty() {
                return (self.normalize_url(ftp), "https_ena".to_string());
            }
        }

        (String::new(), "unknown".to_string())
    }

    /// Normalize FTP URLs to HTTPS
    fn normalize_url(&self, raw_url: &str) -> String {
        let trimmed = raw_url.trim();
        if trimmed.starts_with("ftp://") {
            format!("https://{}", &trimmed[6..])
        } else if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
            format!("https://{}", trimmed)
        } else {
            trimmed.to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_ftp_to_https() {
        let client = EmblClient::default_client();
        assert_eq!(
            client.normalize_url("ftp://ftp.sra.ebi.ac.uk/vol1/fastq/SRR155/SRR1553610/SRR1553610_1.fastq.gz"),
            "https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR155/SRR1553610/SRR1553610_1.fastq.gz"
        );
        assert_eq!(
            client.normalize_url("ftp.sra.ebi.ac.uk/vol1/fastq/file.fastq.gz"),
            "https://ftp.sra.ebi.ac.uk/vol1/fastq/file.fastq.gz"
        );
        assert_eq!(
            client.normalize_url("https://sra-pub-run-1.s3.amazonaws.com/sra.sra"),
            "https://sra-pub-run-1.s3.amazonaws.com/sra.sra"
        );
    }

    #[test]
    fn test_select_cloud_mirror_priority() {
        let client = EmblClient::default_client();

        // AWS prioritized over GCP and ENA FTP
        let (url, mirror) = client.select_url(
            Some("https://sra-pub-run-1.s3.amazonaws.com/run.sra"),
            Some("https://storage.googleapis.com/bucket/run.sra"),
            Some("ftp://ftp.sra.ebi.ac.uk/run.sra"),
        );
        assert_eq!(mirror, "aws_s3");
        assert_eq!(url, "https://sra-pub-run-1.s3.amazonaws.com/run.sra");

        // GCP prioritized when AWS missing
        let (url, mirror) = client.select_url(
            None,
            Some("https://storage.googleapis.com/bucket/run.sra"),
            Some("ftp://ftp.sra.ebi.ac.uk/run.sra"),
        );
        assert_eq!(mirror, "gcp");
        assert_eq!(url, "https://storage.googleapis.com/bucket/run.sra");

        // ENA HTTPS used when AWS/GCP missing
        let (url, mirror) = client.select_url(
            None,
            None,
            Some("ftp://ftp.sra.ebi.ac.uk/run.sra"),
        );
        assert_eq!(mirror, "https_ena");
        assert_eq!(url, "https://ftp.sra.ebi.ac.uk/run.sra");
    }
}

