use serde::Deserialize;
use std::collections::HashMap;

pub(crate) const ESEARCH_URL: &str = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
pub(crate) const ESUMMARY_URL: &str = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";

#[derive(Deserialize)]
pub(crate) struct EsearchResult {
    pub count: Option<String>,
    pub querykey: Option<String>,
    pub webenv: Option<String>,
    pub idlist: Option<Vec<String>>,
}

#[derive(Deserialize)]
pub(crate) struct EsearchResponseWrapper {
    pub esearchresult: Option<EsearchResult>,
}

#[derive(Deserialize, Default)]
#[allow(dead_code)]
pub(crate) struct EsummaryItem {
    // SRA fields
    pub expxml: Option<String>,
    pub runs: Option<String>,
    pub createdate: Option<String>,

    // Assembly / Genome fields (GCF / GCA)
    pub assemblyaccession: Option<String>,
    pub assemblyname: Option<String>,
    pub assemblydescription: Option<String>,
    pub organism: Option<String>,
    pub taxid: Option<serde_json::Value>,
    pub assemblystatus: Option<String>,
    pub refseq_category: Option<String>,
    pub asmreleasedate_refseq: Option<String>,
    pub asmreleasedate_genbank: Option<String>,
    pub seqreleasedate: Option<String>,
    pub submissiondate: Option<String>,
    pub submitterorganization: Option<String>,
    pub submitter: Option<String>,
    pub ftppath_refseq: Option<String>,
    pub ftppath_genbank: Option<String>,
    pub meta: Option<String>,

    // Nucleotide fields
    pub caption: Option<String>,
    pub title: Option<String>,
    pub slen: Option<u64>,
}

#[derive(Deserialize)]
pub(crate) struct EsummaryResponseWrapper {
    pub result: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GenomeAnnotationLayers {
    #[serde(default = "default_true")]
    pub genome_fasta: bool,
    #[serde(default = "default_true")]
    pub genome_gff: bool,
    #[serde(default = "default_true")]
    pub protein_fasta: bool,
    #[serde(default)]
    pub cds_fasta: bool,
    #[serde(default)]
    pub rna_fasta: bool,
    #[serde(default = "default_true")]
    pub sequence_report: bool,
}

fn default_true() -> bool {
    true
}

impl Default for GenomeAnnotationLayers {
    fn default() -> Self {
        Self {
            genome_fasta: true,
            genome_gff: true,
            protein_fasta: true,
            cds_fasta: false,
            rna_fasta: false,
            sequence_report: true,
        }
    }
}

impl GenomeAnnotationLayers {
    pub fn to_annotation_types(&self) -> Vec<&'static str> {
        let mut types = Vec::new();
        if self.genome_fasta {
            types.push("GENOME_FASTA");
        }
        if self.genome_gff {
            types.push("GENOME_GFF");
        }
        if self.protein_fasta {
            types.push("PROT_FASTA");
        }
        if self.cds_fasta {
            types.push("CDS_FASTA");
        }
        if self.rna_fasta {
            types.push("RNA_FASTA");
        }
        if self.sequence_report {
            types.push("SEQUENCE_REPORT");
        }
        types
    }

    pub fn build_download_url(&self, accession: &str) -> String {
        self.build_download_url_batch(&[accession.to_string()])
    }

    pub fn build_download_url_batch(&self, accessions: &[String]) -> String {
        let types = self.to_annotation_types();
        let query_params = types
            .iter()
            .map(|t| format!("include_annotation_type={}", t))
            .collect::<Vec<_>>()
            .join("&");

        let acc_param = accessions.join(",");

        if query_params.is_empty() {
            format!(
                "https://api.ncbi.nlm.nih.gov/datasets/v2/genome/accession/{}/download?hydrated=FULLY_HYDRATED",
                acc_param
            )
        } else {
            format!(
                "https://api.ncbi.nlm.nih.gov/datasets/v2/genome/accession/{}/download?{}&hydrated=FULLY_HYDRATED",
                acc_param, query_params
            )
        }
    }
}
