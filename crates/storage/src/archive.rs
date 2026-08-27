use crate::error::StorageError;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufReader};
use std::path::{Path, PathBuf};
use tracing::{debug, info};
use zip::ZipArchive;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedFileInfo {
    pub filename: String,
    pub path: PathBuf,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedGenomeInfo {
    pub accession: String,
    pub directory: PathBuf,
    pub files: Vec<ExtractedFileInfo>,
}

const MAX_ARCHIVE_ENTRIES: usize = 10_000;
const MAX_ENTRY_BYTES: u64 = 20 * 1024 * 1024 * 1024;
const MAX_TOTAL_EXTRACTED_BYTES: u64 = 100 * 1024 * 1024 * 1024;
const MAX_COMPRESSION_RATIO: u64 = 1_000;

/// Extracts an NCBI Datasets genome package `.zip` file into organized folders per accession
/// under `target_genomes_dir` (e.g. `~/.vortexflow/genomes/<accession>/`).
///
/// Keeps all exact original filenames as provided by NCBI inside the archive without renaming.
pub fn extract_genome_package(
    zip_path: &Path,
    target_genomes_dir: &Path,
) -> Result<Vec<ExtractedGenomeInfo>, StorageError> {
    info!(
        zip = %zip_path.display(),
        target = %target_genomes_dir.display(),
        "Extracting NCBI genome package zip archive"
    );

    let file = File::open(zip_path)?;
    let reader = BufReader::new(file);
    let mut archive = ZipArchive::new(reader)?;

    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(StorageError::ExtractionLimit(format!(
            "entry count {} exceeds {}",
            archive.len(),
            MAX_ARCHIVE_ENTRIES
        )));
    }

    fs::create_dir_all(target_genomes_dir)?;

    let mut extracted_by_accession: HashMap<String, (PathBuf, Vec<ExtractedFileInfo>)> =
        HashMap::new();

    let mut recognized_accessions: HashSet<String> = HashSet::new();
    let mut total_extracted_bytes = 0_u64;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let raw_name = entry.name().to_string();

        // Skip directories and metadata root entries
        if entry.is_dir() {
            continue;
        }

        let entry_size = entry.size();
        total_extracted_bytes = total_extracted_bytes.saturating_add(entry_size);
        if entry_size > MAX_ENTRY_BYTES || total_extracted_bytes > MAX_TOTAL_EXTRACTED_BYTES {
            return Err(StorageError::ExtractionLimit(format!(
                "entry '{}' exceeds the configured size budget",
                raw_name
            )));
        }
        if entry.compressed_size() > 0 && entry_size / entry.compressed_size() > MAX_COMPRESSION_RATIO {
            return Err(StorageError::ExtractionLimit(format!(
                "entry '{}' has an unsafe compression ratio",
                raw_name
            )));
        }

        // Sanitize path to prevent zip-slip
        let path = match entry.enclosed_name() {
            Some(p) => p.to_path_buf(),
            None => {
                debug!(raw_name = %raw_name, "Skipping malformed zip entry path");
                continue;
            }
        };

        // Standard NCBI hierarchy is: `ncbi_dataset/data/<accession>/<filename>`
        // Or sometimes directly `<accession>/<filename>`
        let components: Vec<String> = path
            .components()
            .map(|c| c.as_os_str().to_string_lossy().to_string())
            .collect();

        let mut accession_opt = None;
        let mut filename_opt = None;

        for (idx, comp) in components.iter().enumerate() {
            // NCBI accessions start with GCF_ or GCA_ (or are alphanumeric identifiers inside ncbi_dataset/data/)
            if comp.starts_with("GCF_") || comp.starts_with("GCA_") {
                accession_opt = Some(comp.clone());
                if idx + 1 < components.len() {
                    filename_opt = Some(components[idx + 1..].join("/"));
                }
                break;
            } else if idx > 0
                && components[idx - 1] == "data"
                && idx + 1 < components.len()
                && !comp.ends_with(".jsonl")
                && !comp.ends_with(".json")
            {
                // Fallback for custom or novel accession format inside data/<acc>/...
                accession_opt = Some(comp.clone());
                filename_opt = Some(components[idx + 1..].join("/"));
                break;
            }
        }

        if let (Some(accession), Some(relative_filename)) = (accession_opt, filename_opt) {
            recognized_accessions.insert(accession.clone());
            let genome_dir = target_genomes_dir.join(&accession);
            fs::create_dir_all(&genome_dir)?;

            let dest_file_path = genome_dir.join(&relative_filename);
            if let Some(parent) = dest_file_path.parent() {
                fs::create_dir_all(parent)?;
            }

            let mut out_file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&dest_file_path)?;
            let written_bytes = io::copy(&mut entry, &mut out_file)?;

            let entry_info = ExtractedFileInfo {
                filename: relative_filename,
                path: dest_file_path,
                size_bytes: written_bytes,
            };

            let entry_slot = extracted_by_accession
                .entry(accession)
                .or_insert_with(|| (genome_dir, Vec::new()));
            entry_slot.1.push(entry_info);
        } else {
            // Root level reports (e.g. assembly_data_report.jsonl or dataset_catalog.json)
            let leaf_name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| raw_name.clone());

            debug!(
                file = %leaf_name,
                "Extracted root catalog or metadata report from genome zip"
            );
        }
    }

    let mut result = Vec::new();
    for (accession, (directory, files)) in extracted_by_accession {
        info!(
            accession = %accession,
            files_count = files.len(),
            dir = %directory.display(),
            "Successfully extracted genome package"
        );
        result.push(ExtractedGenomeInfo {
            accession,
            directory,
            files,
        });
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;
    use zip::write::SimpleFileOptions;

    #[test]
    fn test_extract_ncbi_genome_package() {
        let temp = tempdir().unwrap();
        let zip_path = temp.path().join("test_package.zip");
        let target_dir = temp.path().join("genomes");

        // Create a mock NCBI zip package
        {
            let file = File::create(&zip_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);

            let options = SimpleFileOptions::default();

            // Entry 1: GCF_008244785.1 genomic fasta
            zip.start_file(
                "ncbi_dataset/data/GCF_008244785.1/GCF_008244785.1_ASM824478v1_genomic.fna",
                options,
            )
            .unwrap();
            zip.write_all(b">NC_000913.3 E. coli genome contig\nATGCGTAGCTAGCTAG\n")
                .unwrap();

            // Entry 2: GCF_008244785.1 genomic gff
            zip.start_file("ncbi_dataset/data/GCF_008244785.1/genomic.gff", options)
                .unwrap();
            zip.write_all(b"##gff-version 3\nNC_000913.3\tRefSeq\tgene\t1\t100\t.\t+\t.\tID=gene-b0001\n")
                .unwrap();

            // Entry 3: GCF_000005845.2 protein faa
            zip.start_file("ncbi_dataset/data/GCF_000005845.2/protein.faa", options)
                .unwrap();
            zip.write_all(b">NP_414542.1 thr operon leader peptide\nMKRISTTITTTITITTG*\n")
                .unwrap();

            // Entry 4: Root dataset catalog
            zip.start_file("ncbi_dataset/data/dataset_catalog.json", options)
                .unwrap();
            zip.write_all(b"{\"catalog\": []}").unwrap();

            zip.finish().unwrap();
        }

        // Test extraction
        let extracted = extract_genome_package(&zip_path, &target_dir).unwrap();

        assert_eq!(extracted.len(), 2);

        let gcf1 = extracted
            .iter()
            .find(|g| g.accession == "GCF_008244785.1")
            .expect("GCF_008244785.1 must be extracted");
        assert_eq!(gcf1.files.len(), 2);
        assert!(gcf1
            .directory
            .join("GCF_008244785.1_ASM824478v1_genomic.fna")
            .exists());
        assert!(gcf1.directory.join("genomic.gff").exists());

        let gcf2 = extracted
            .iter()
            .find(|g| g.accession == "GCF_000005845.2")
            .expect("GCF_000005845.2 must be extracted");
        assert_eq!(gcf2.files.len(), 1);
        assert!(gcf2.directory.join("protein.faa").exists());
    }
}
