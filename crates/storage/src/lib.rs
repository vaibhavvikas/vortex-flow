pub mod archive;
pub mod error;

pub use archive::{extract_genome_package, ExtractedFileInfo, ExtractedGenomeInfo};
pub use error::StorageError;
