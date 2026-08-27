use crate::common::{RequestRateLimiter, ResolvedFileMetadata, SraRecord, SraSearchResponse};
use crate::error::ProviderError;
use crate::ncbi::models::{
    EsearchResponseWrapper, EsearchResult, EsummaryItem, EsummaryResponseWrapper, ESEARCH_URL,
    ESUMMARY_URL,
};
use std::collections::HashMap;

pub const ENTREZ_EFETCH_URL: &str = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
pub const NCBI_S3_BASE_URL: &str = "https://sra-pub-run-odp.s3.amazonaws.com/sra";
pub const ENA_FASTA_API_URL: &str = "https://www.ebi.ac.uk/ena/browser/api/fasta";

pub struct NcbiClient {
    client: reqwest::Client,
    rate_limiter: RequestRateLimiter,
    api_key: Option<String>,
}

impl NcbiClient {
    pub fn new(api_key: Option<String>) -> Self {
        let rate_limiter = if api_key.is_some() {
            RequestRateLimiter::default_with_api_key()
        } else {
            RequestRateLimiter::default_public()
        };

        let client = reqwest::Client::builder()
            .user_agent("NCBI-Eutils-Client/1.0")
            .build()
            .unwrap_or_default();
        Self {
            client,
            rate_limiter,
            api_key,
        }
    }

    pub fn default_client() -> Self {
        Self::new(None)
    }

    /// Fetch FASTA download URLs and metadata for a batch of accessions
    pub async fn fetch_fasta_links(
        &self,
        accessions: &[String],
    ) -> Result<Vec<ResolvedFileMetadata>, ProviderError> {
        let mut results = Vec::new();
        for acc in accessions {
            self.rate_limiter.wait().await;

            let download_url = format!(
                "{}?db=sra&id={}&rettype=fasta&retmode=text",
                ENTREZ_EFETCH_URL, acc
            );
            let file_name = format!("{}.fasta", acc);

            results.push(ResolvedFileMetadata {
                item_id: acc.clone(),
                accession: acc.clone(),
                file_name,
                format: "fasta".to_string(),
                read_pair: 1,
                download_url,
                mirror_type: "ncbi_fasta".to_string(),
                file_size_bytes: 0,
                md5_checksum: None,
                sha256_checksum: None,
            });
        }
        Ok(results)
    }

    /// Fetch SRA download URLs from S3 storage
    pub async fn fetch_sra_links(
        &self,
        accessions: &[String],
    ) -> Result<Vec<ResolvedFileMetadata>, ProviderError> {
        let mut results = Vec::new();
        for acc in accessions {
            if acc.len() < 6 {
                continue;
            }
            self.rate_limiter.wait().await;

            let download_url = format!("{}/{}/{}", NCBI_S3_BASE_URL, acc, acc);

            results.push(ResolvedFileMetadata {
                item_id: acc.clone(),
                accession: acc.clone(),
                file_name: format!("{}.sra", acc),
                format: "sra".to_string(),
                read_pair: 1,
                download_url,
                mirror_type: "aws_s3".to_string(),
                file_size_bytes: 0,
                md5_checksum: None,
                sha256_checksum: None,
            });
        }
        Ok(results)
    }

    /// Primary search method for NCBI Entrez records
    pub async fn search_sra(
        &self,
        term: &str,
        db: &str,
        page: usize,
        retmax: usize,
    ) -> Result<SraSearchResponse, ProviderError> {
        let retstart = (page.saturating_sub(1)) * retmax;
        let selected_db = if db.trim().is_empty() { "sra" } else { db.trim() };

        tracing::info!(
            "Executing NCBI query on db='{}': '{}' (page {}, retstart {}, retmax {})",
            selected_db,
            term,
            page,
            retstart,
            retmax
        );

        // Step 1: Execute ESearch to get query_key, WebEnv, and ID list
        let esearch = self.fetch_esearch(term, selected_db, retstart, retmax).await?;
        let total_count = esearch
            .count
            .as_deref()
            .and_then(|c| c.parse::<usize>().ok())
            .unwrap_or(0);

        let id_list = esearch.idlist.unwrap_or_default();

        if id_list.is_empty() {
            return Ok(SraSearchResponse {
                query: term.to_string(),
                total_count: 0,
                page,
                page_size: retmax,
                records: Vec::new(),
            });
        }

        // Step 2: Execute ESummary using History server params (WebEnv & query_key) or fallback IDs
        let summary_map = self
            .fetch_esummary(
                selected_db,
                esearch.querykey.as_deref(),
                esearch.webenv.as_deref(),
                &id_list,
                retstart,
                retmax,
            )
            .await?;

        // Step 3: Parse JSON items into structured SraRecords
        let records = self.parse_summary_records(&id_list, &summary_map);

        Ok(SraSearchResponse {
            query: term.to_string(),
            total_count,
            page,
            page_size: retmax,
            records,
        })
    }

    /// Execute esearch query against Entrez
    pub(crate) async fn fetch_esearch(
        &self,
        term: &str,
        db: &str,
        retstart: usize,
        retmax: usize,
    ) -> Result<EsearchResult, ProviderError> {
        self.rate_limiter.wait().await;
        let mut search_url = format!(
            "{}?db={}&usehistory=y&retmode=json&retstart={}&retmax={}&term={}",
            ESEARCH_URL,
            db,
            retstart,
            retmax,
            urlencoding::encode(term)
        );
        if let Some(ref key) = self.api_key {
            search_url.push_str(&format!("&api_key={}", key));
        }

        let res = self.client.get(&search_url).send().await?;
        let wrapper: EsearchResponseWrapper = res.json().await?;

        wrapper
            .esearchresult
            .ok_or_else(|| ProviderError::Api("Empty esearchresult response from NCBI".to_string()))
    }

    /// Execute esummary query using History WebEnv/query_key or direct IDs
    pub(crate) async fn fetch_esummary(
        &self,
        db: &str,
        query_key: Option<&str>,
        web_env: Option<&str>,
        id_list: &[String],
        retstart: usize,
        retmax: usize,
    ) -> Result<HashMap<String, serde_json::Value>, ProviderError> {
        self.rate_limiter.wait().await;
        let mut summary_url = match (query_key, web_env) {
            (Some(qk), Some(we)) => format!(
                "{}?db={}&retmode=json&query_key={}&WebEnv={}&retstart={}&retmax={}",
                ESUMMARY_URL, db, qk, we, retstart, retmax
            ),
            _ => format!(
                "{}?db={}&retmode=json&id={}",
                ESUMMARY_URL,
                db,
                id_list.join(",")
            ),
        };
        if let Some(ref key) = self.api_key {
            summary_url.push_str(&format!("&api_key={}", key));
        }

        let res = self.client.get(&summary_url).send().await?;
        let wrapper: EsummaryResponseWrapper = res.json().await?;
        Ok(wrapper.result.unwrap_or_default())
    }

    /// Parse list of summary items into SraRecords (supporting SRA, Assembly, and Nucleotide)
    fn parse_summary_records(
        &self,
        id_list: &[String],
        summary_map: &HashMap<String, serde_json::Value>,
    ) -> Vec<SraRecord> {
        let mut records = Vec::new();
        for uid in id_list {
            if let Some(val) = summary_map.get(uid) {
                if let Ok(item) = serde_json::from_value::<EsummaryItem>(val.clone()) {
                    if item.assemblyaccession.is_some() || item.assemblyname.is_some() {
                        records.push(parse_assembly_record(uid, &item));
                    } else {
                        records.push(parse_sra_record(uid, &item));
                    }
                }
            }
        }
        records
    }
}

fn clean_date_string(s: &str) -> String {
    let t = s.trim();
    if t.is_empty()
        || t.starts_with("0000")
        || t.starts_with("0001")
        || t.starts_with("01/01/01")
        || t.starts_with("01/01/0001")
        || t.starts_with("1/1/01")
        || t.starts_with("1970")
    {
        return String::new();
    }
    let date_part = t.split_whitespace().next().unwrap_or(t).split('T').next().unwrap_or(t);
    if let Some(first_part) = date_part.split('/').next().or_else(|| date_part.split('-').next()) {
        if let Ok(year) = first_part.trim().parse::<u32>() {
            if year < 1970 {
                return String::new();
            }
        }
    }
    date_part.trim().to_string()
}

/// Helper function to parse individual EsummaryItem XML fields into an SraRecord
fn parse_sra_record(uid: &str, item: &EsummaryItem) -> SraRecord {
    let expxml = item.expxml.as_deref().unwrap_or("");
    let runs_xml = item.runs.as_deref().unwrap_or("");

    let title = extract_tag_content(expxml, "Title").unwrap_or_else(|| format!("SRA Record {}", uid));
    let organism = extract_attr_val(expxml, "Organism", "ScientificName")
        .or_else(|| extract_tag_content(expxml, "Organism"))
        .unwrap_or_else(|| "Unknown".to_string());
    let platform = extract_tag_content(expxml, "Platform")
        .or_else(|| extract_attr_val(expxml, "Platform", "instrument_model"))
        .unwrap_or_else(|| "UNKNOWN".to_string());
    let study_id = extract_attr_val(expxml, "Study", "acc")
        .unwrap_or_else(|| format!("SRP{}", uid));
    let accession = extract_attr_val(runs_xml, "Run", "acc")
        .or_else(|| extract_attr_val(expxml, "Run", "acc"))
        .unwrap_or_else(|| format!("SRR{}", uid));
    let total_spots = extract_attr_val(runs_xml, "Run", "total_spots")
        .or_else(|| extract_attr_val(expxml, "Statistics", "total_spots"))
        .map(|s| format_spots(&s))
        .unwrap_or_else(|| "N/A".to_string());

    let instrument_model = extract_attr_val(expxml, "Platform", "instrument_model")
        .or_else(|| extract_attr_val(expxml, "Instrument", "ILLUMINA"))
        .or_else(|| extract_tag_content(expxml, "INSTRUMENT_MODEL"));
    let library_strategy = extract_tag_content(expxml, "LIBRARY_STRATEGY");
    let library_source = extract_tag_content(expxml, "LIBRARY_SOURCE");
    let library_selection = extract_tag_content(expxml, "LIBRARY_SELECTION");
    let library_layout = extract_tag_content(expxml, "LIBRARY_LAYOUT")
        .map(|content| clean_tag_text(&content));

    let total_runs = extract_attr_val(expxml, "Statistics", "total_runs");
    let total_bases = extract_attr_val(expxml, "Statistics", "total_bases")
        .or_else(|| extract_attr_val(runs_xml, "Run", "total_bases"))
        .map(|b| format_bytes_or_bases(&b, false));
    let total_size = extract_attr_val(expxml, "Statistics", "total_size")
        .or_else(|| extract_attr_val(runs_xml, "Run", "size"))
        .map(|s| format_bytes_or_bases(&s, true));

    let submitter_acc = extract_attr_val(expxml, "Submitter", "acc");
    let center_name = extract_attr_val(expxml, "Submitter", "center_name");
    let experiment_acc = extract_attr_val(expxml, "Experiment", "acc");
    let bioproject = extract_tag_content(expxml, "Bioproject")
        .or_else(|| extract_tag_content(expxml, "BioProject"));
    let biosample = extract_tag_content(expxml, "Biosample")
        .or_else(|| extract_tag_content(expxml, "BioSample"));
    let sample_acc = extract_attr_val(expxml, "Sample", "acc");
    let construction_protocol = extract_tag_content(expxml, "LIBRARY_CONSTRUCTION_PROTOCOL");

    let cell_line = extract_sample_attribute(expxml, "cell_line")
        .or_else(|| extract_sample_attribute(expxml, "cell line"));
    let source_name = extract_sample_attribute(expxml, "source_name")
        .or_else(|| extract_sample_attribute(expxml, "source name"));
    let treatment = extract_sample_attribute(expxml, "treatment")
        .or_else(|| extract_sample_attribute(expxml, "Treatment"));
    let antibody = extract_sample_attribute(expxml, "antibody")
        .or_else(|| extract_sample_attribute(expxml, "Antibody"));

    SraRecord {
        id: uid.to_string(),
        accession,
        title,
        organism,
        platform,
        total_spots,
        release_date: item.createdate.as_deref().map(clean_date_string).unwrap_or_default(),
        study_id,
        instrument_model,
        library_strategy,
        library_source,
        library_selection,
        library_layout,
        total_runs,
        total_bases,
        total_size,
        submitter_acc,
        center_name,
        experiment_acc,
        bioproject,
        biosample,
        sample_acc,
        construction_protocol,
        cell_line,
        source_name,
        treatment,
        antibody,
        expxml: if expxml.is_empty() { None } else { Some(expxml.to_string()) },
        is_downloaded: None,
        status: None,
    }
}

fn clean_tag_text(content: &str) -> String {
    content
        .trim_start_matches('<')
        .trim_end_matches("/>")
        .trim_end_matches('>')
        .trim()
        .to_string()
}

fn extract_tag_content(xml: &str, tag_name: &str) -> Option<String> {
    let open_tag = format!("<{}>", tag_name);
    let close_tag = format!("</{}>", tag_name);
    if let (Some(start), Some(end)) = (xml.find(&open_tag), xml.find(&close_tag)) {
        let content_start = start + open_tag.len();
        if content_start < end {
            let val = xml[content_start..end].trim();
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

fn extract_attr_val(xml: &str, tag_name: &str, attr_name: &str) -> Option<String> {
    let tag_lower = tag_name.to_lowercase();
    let xml_lower = xml.to_lowercase();
    let attr_lower = format!("{}=\"", attr_name.to_lowercase());

    if let Some(tag_pos) = xml_lower.find(&format!("<{}", tag_lower)) {
        let tag_slice = &xml[tag_pos..];
        if let Some(tag_end) = tag_slice.find('>') {
            let attr_area = &tag_slice[..tag_end];
            let attr_area_lower = attr_area.to_lowercase();
            if let Some(attr_pos) = attr_area_lower.find(&attr_lower) {
                let val_start = attr_pos + attr_lower.len();
                let val_slice = &attr_area[val_start..];
                if let Some(val_end) = val_slice.find('"') {
                    let val = val_slice[..val_end].trim();
                    if !val.is_empty() {
                        return Some(val.to_string());
                    }
                }
            }
        }
    }
    None
}

fn format_spots(raw: &str) -> String {
    if let Ok(num) = raw.parse::<u64>() {
        if num >= 1_000_000 {
            format!("{:.1}M reads", num as f64 / 1_000_000.0)
        } else if num >= 1_000 {
            format!("{:.1}K reads", num as f64 / 1_000.0)
        } else {
            format!("{} reads", num)
        }
    } else if !raw.is_empty() {
        raw.to_string()
    } else {
        "N/A".to_string()
    }
}

fn format_bytes_or_bases(raw: &str, is_bytes: bool) -> String {
    if let Ok(num) = raw.parse::<u64>() {
        let gb = num as f64 / 1_000_000_000.0;
        let mb = num as f64 / 1_000_000.0;
        if gb >= 1.0 {
            format!("{:.2} {}", gb, if is_bytes { "GB" } else { "Gb" })
        } else if mb >= 1.0 {
            format!("{:.1} {}", mb, if is_bytes { "MB" } else { "Mb" })
        } else {
            format!("{} {}", num, if is_bytes { "B" } else { "bp" })
        }
    } else {
        raw.to_string()
    }
}

fn extract_sample_attribute(xml: &str, tag_name: &str) -> Option<String> {
    let lower_xml = xml.to_lowercase();
    let lower_tag = tag_name.to_lowercase();
    if let Some(idx) = lower_xml.find(&lower_tag) {
        let slice = &xml[idx..];
        if let Some(val_start) = slice.find("<VALUE>").or_else(|| slice.find("<value>")) {
            let val_slice = &slice[val_start + 7..];
            if let Some(val_end) = val_slice.find("</VALUE>").or_else(|| val_slice.find("</value>")) {
                let val = val_slice[..val_end].trim();
                if !val.is_empty() {
                    return Some(val.to_string());
                }
            }
        }
    }
    None
}

/// Helper to parse NCBI Assembly (GCF / GCA) records into SraRecord structure
fn parse_assembly_record(uid: &str, item: &EsummaryItem) -> SraRecord {
    let accession = item
        .assemblyaccession
        .clone()
        .unwrap_or_else(|| format!("GCA_{}", uid));

    let title = item
        .assemblyname
        .clone()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| item.assemblydescription.clone().filter(|s| !s.trim().is_empty()))
        .unwrap_or_else(|| format!("Genome Assembly {}", uid));

    let organism = item.organism.clone().unwrap_or_else(|| "Unknown".to_string());
    let platform = item.assemblystatus.clone().unwrap_or_else(|| "Genome Assembly".to_string());

    let raw_date = item
        .asmreleasedate_refseq
        .as_deref()
        .map(clean_date_string)
        .filter(|s| !s.is_empty())
        .or_else(|| item.asmreleasedate_genbank.as_deref().map(clean_date_string).filter(|s| !s.is_empty()))
        .or_else(|| item.seqreleasedate.as_deref().map(clean_date_string).filter(|s| !s.is_empty()))
        .or_else(|| item.submissiondate.as_deref().map(clean_date_string).filter(|s| !s.is_empty()))
        .or_else(|| item.createdate.as_deref().map(clean_date_string).filter(|s| !s.is_empty()))
        .unwrap_or_default();
    let release_date = raw_date;

    let refseq_cat = item
        .refseq_category
        .clone()
        .unwrap_or_else(|| "Assembly".to_string());

    let meta = item.meta.as_deref().unwrap_or("");
    let total_bases = extract_stat_category(meta, "total_length")
        .map(|b| format_bytes_or_bases(&b, false));

    let taxid_str = item.taxid.as_ref().map(|v| match v {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Number(n) => n.to_string(),
        _ => String::new(),
    }).unwrap_or_default();

    SraRecord {
        id: uid.to_string(),
        accession,
        title,
        organism,
        platform,
        total_spots: refseq_cat,
        release_date,
        study_id: if taxid_str.is_empty() {
            "Assembly".to_string()
        } else {
            format!("TaxID:{}", taxid_str)
        },
        instrument_model: item.assemblyname.clone(),
        library_strategy: Some("Assembly / Reference Genome".to_string()),
        library_source: Some("GENOMIC".to_string()),
        library_selection: Some("RefSeq/GenBank".to_string()),
        library_layout: item.assemblystatus.clone(),
        total_runs: Some("1".to_string()),
        total_bases,
        total_size: None,
        submitter_acc: None,
        center_name: item.submitterorganization.clone().or_else(|| item.submitter.clone()),
        experiment_acc: None,
        bioproject: None,
        biosample: None,
        sample_acc: None,
        construction_protocol: None,
        cell_line: None,
        source_name: None,
        treatment: None,
        antibody: None,
        expxml: item.meta.clone(),
        is_downloaded: None,
        status: None,
    }
}

fn extract_stat_category(xml: &str, category: &str) -> Option<String> {
    let lower_xml = xml.to_lowercase();
    let cat_pattern = format!("category=\"{}\"", category.to_lowercase());
    if let Some(pos) = lower_xml.find(&cat_pattern) {
        let after = &xml[pos..];
        if let Some(tag_end) = after.find('>') {
            let content_start = tag_end + 1;
            let val_slice = &after[content_start..];
            if let Some(close_tag) = val_slice.find("</Stat>").or_else(|| val_slice.find("</stat>")) {
                let val = val_slice[..close_tag].trim();
                if !val.is_empty() {
                    return Some(val.to_string());
                }
            }
        }
    }
    None
}
