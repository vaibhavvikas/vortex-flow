use std::sync::{Arc, Mutex};
use vortexflow_providers::{NcbiClient, SraRecord};

#[derive(Clone)]
pub struct AppState {
  pub ncbi_client: Arc<NcbiClient>,
  pub collection: Arc<Mutex<Vec<SraRecord>>>,
}

impl AppState {
  pub fn new() -> Self {
    Self {
      ncbi_client: Arc::new(NcbiClient::new()),
      collection: Arc::new(Mutex::new(Vec::new())),
    }
  }
}
