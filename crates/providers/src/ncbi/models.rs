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

#[derive(Deserialize)]
pub(crate) struct EsummaryItem {
    pub expxml: Option<String>,
    pub runs: Option<String>,
    pub createdate: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct EsummaryResponseWrapper {
    pub result: Option<HashMap<String, serde_json::Value>>,
}
