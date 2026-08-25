use crate::common::types::SraSearchResponse;
use crate::error::ProviderError;

pub trait SequenceProvider: Send + Sync {
    fn provider_name(&self) -> &'static str;

    fn search(
        &self,
        query: &str,
        db: &str,
        page: usize,
        page_size: usize,
    ) -> impl std::future::Future<Output = Result<SraSearchResponse, ProviderError>> + Send;
}
